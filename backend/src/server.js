const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const db = require('./config/db');
const crypto = require('crypto');
const { evaluatePlayerRule } = require('./services/aiService');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Função utilitária para enviar JSON para a Godot
const sendToClient = (ws, action, data) => {
    ws.send(JSON.stringify({ action, data }));
};

// Guarda as votações ativas em memória
const activeVotes = {};
// Guarda as regras pendentes de avaliação
const pendingRules = {};

wss.on('connection', (ws) => {
    console.log('[+] Novo cliente Godot conectado!');

    ws.on('message', async (message) => {
        // A Godot vai enviar mensagens em formato JSON
        const parsedMessage = JSON.parse(message);
        const { action, data } = parsedMessage;

        if (action === 'create_room') {
            try {
                const roomCode = crypto.randomBytes(3).toString('hex').toUpperCase().substring(0, 5);
                const result = await db.query(
                    'INSERT INTO matches (room_code, status) VALUES ($1, $2) RETURNING id, room_code',
                    [roomCode, 'waiting']
                );
                
                console.log(`[ROOM] Sala ${roomCode} criada.`);
                sendToClient(ws, 'room_created', { success: true, roomCode: result.rows[0].room_code });
            } catch (error) {
                console.error("Erro ao criar sala:", error);
            }
        }

        if (action === 'submit_rule') {
            const { matchId, userId, ruleText } = data;
            
            try {
                console.log(`[IA] Avaliando regra: "${ruleText}"...`);
                const aiResult = await evaluatePlayerRule(ruleText);
                const cost = aiResult.coin_cost;
                
                const playerResult = await db.query('SELECT coins FROM match_players WHERE match_id = $1 AND user_id = $2', [matchId, userId]);
                if (playerResult.rows.length === 0) {
                    return sendToClient(ws, 'error', { message: 'Jogador não encontrado na mesa.' });
                }
                const playerCoins = playerResult.rows[0].coins;

                // Cria um ID temporário para a regra em espera
                const pendingId = `pending_${Date.now()}`;
                pendingRules[pendingId] = {
                    matchId, userId, ruleText, cost, payload: aiResult.action_payload
                };

                console.log(`[DECISÃO] IA cobrou ${cost} moedas. Jogador tem ${playerCoins}. Aguardando decisão...`);
                
                // Envia de volta APENAS para quem criou a regra tomar a decisão
                sendToClient(ws, 'rule_priced', {
                    pendingId: pendingId,
                    ruleText: ruleText,
                    cost: cost,
                    playerCoins: playerCoins,
                    canAfford: playerCoins >= cost // Flag para a Godot saber se habilita o botão de "Comprar" ou não
                });

            } catch (error) {
                console.error("\n[ERRO DETALHADO NO SERVIDOR]:", error);
                sendToClient(ws, 'error', { message: 'A IA falhou ao avaliar a regra.' });
            }
        }

        // O jogador decidiu o que fazer com a regra avaliada
        if (action === 'decide_rule') {
            const { pendingId, decision } = data; // decision pode ser 'buy' ou 'vote'
            const pending = pendingRules[pendingId];

            if (!pending) {
                return sendToClient(ws, 'error', { message: 'Esta regra expirou ou não existe mais.' });
            }

            if (decision === 'buy') {
                console.log(`[ECONOMIA] Jogador escolheu COMPRAR a regra por ${pending.cost} moedas.`);
                
                // Desconta as moedas
                await db.query('UPDATE match_players SET coins = coins - $1 WHERE match_id = $2 AND user_id = $3', [pending.cost, pending.matchId, pending.userId]);
                
                // Salva a regra no banco
                const dbResult = await db.query(
                    'INSERT INTO dynamic_rules (match_id, creator_user_id, original_prompt, llm_action_payload, coin_cost) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                    [pending.matchId, pending.userId, pending.ruleText, pending.payload, pending.cost]
                );

                sendToClient(ws, 'rule_applied', { ruleId: dbResult.rows[0].id, payload: pending.payload });
                
            } else if (decision === 'vote') {
                console.log(`[ECONOMIA] Jogador escolheu VOTAR a regra de ${pending.cost} moedas.`);
                
                const matchPlayersRes = await db.query('SELECT COUNT(*) as total FROM match_players WHERE match_id = $1', [pending.matchId]);
                const totalPlayers = parseInt(matchPlayersRes.rows[0].total);

                const voteId = `vote_${Date.now()}`;
                activeVotes[voteId] = { 
                    creatorId: pending.userId, 
                    yes: 0, 
                    no: 0, 
                    required_votes: totalPlayers > 1 ? totalPlayers - 1 : 0,
                    state: 'voting',
                    pendingData: pending // Salva os dados da regra para injetar no banco se for aprovada
                };

                sendToClient(ws, 'vote_started', { voteId: voteId, ruleText: pending.ruleText, cost: pending.cost });
            }

            // Limpa a memória
            delete pendingRules[pendingId];
        }

        if (action === 'cast_vote') {
            const { voteId, userId, vote } = data; // O frontend agora deve enviar o userId de quem está votando
            const voteSession = activeVotes[voteId];

            if (!voteSession) return;

            // FASE 1: Votação da Mesa
            if (voteSession.state === 'voting') {
                if (userId === voteSession.creatorId) {
                    return sendToClient(ws, 'error', { message: 'Você não pode votar na sua própria regra agora.' });
                }
                
                voteSession[vote]++;
                const totalCast = voteSession.yes + voteSession.no;
                
                console.log(`[VOTAÇÃO] Placar: Sim (${voteSession.yes}) | Não (${voteSession.no})`);

                if (totalCast >= voteSession.required_votes) {
                    if (voteSession.yes === voteSession.no) {
                        // EMPATE NUMÉRICO EXATO: Muda o estado e pede socorro ao criador
                        voteSession.state = 'tiebreaker';
                        console.log(`[VOTAÇÃO] Empate! Aguardando voto de minerva do criador (ID: ${voteSession.creatorId}).`);
                        sendToClient(ws, 'tiebreaker_needed', { voteId });
                    } else {
                        // RESOLUÇÃO DIRETA
                        const approved = voteSession.yes > voteSession.no;
                        console.log(`[VOTAÇÃO ENCERRADA] ${approved ? 'APROVADA' : 'REJEITADA'}`);
                        sendToClient(ws, 'vote_finished', { voteId, approved });
                        delete activeVotes[voteId];
                    }
                }
            } 
            // FASE 2: Desempate do Criador
            else if (voteSession.state === 'tiebreaker') {
                if (userId !== voteSession.creatorId) {
                     return sendToClient(ws, 'error', { message: 'Apenas o criador pode desempatar esta votação.' });
                }
                
                const approved = vote === 'yes';
                console.log(`[VOTAÇÃO ENCERRADA] Desempate do criador: ${approved ? 'APROVADA' : 'REJEITADA'}`);
                sendToClient(ws, 'vote_finished', { voteId, approved });
                delete activeVotes[voteId];
            }
        }

        if (action === 'join_room') {
            const { roomCode, username } = data;
            try {
                const matchResult = await db.query('SELECT id FROM matches WHERE room_code = $1', [roomCode]);
                if (matchResult.rows.length === 0) return sendToClient(ws, 'error', { message: 'Sala não encontrada' });
                
                const match = matchResult.rows[0];
                const userResult = await db.query('INSERT INTO users (username) VALUES ($1) RETURNING id', [username]);
                const userId = userResult.rows[0].id;
                
                await db.query('INSERT INTO match_players (match_id, user_id) VALUES ($1, $2)', [match.id, userId]);
                
                console.log(`[ROOM] ${username} conectou na sala ${roomCode}`);
                sendToClient(ws, 'room_joined', { success: true, matchId: match.id, userId });
            } catch (error) {
                console.error("Erro ao entrar na sala:", error);
            }
        }
    });

    ws.on('close', () => {
        console.log('[-] Cliente desconectado');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando perfeitamente na porta ${PORT}`);
});