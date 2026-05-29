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
                
                // 1. Chama a IA
                const aiResult = await evaluatePlayerRule(ruleText);
                console.log("\n[IA] SUCESSO! A IA respondeu:");
                console.log(JSON.stringify(aiResult, null, 2)); // Mostra o JSON no terminal
                
                // 2. Salva a regra no Banco de Dados
                const dbResult = await db.query(
                    'INSERT INTO dynamic_rules (match_id, creator_user_id, original_prompt, llm_action_payload, coin_cost) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                    [matchId, userId, ruleText, aiResult.action_payload, aiResult.coin_cost]
                );
                
                sendToClient(ws, 'rule_evaluated', {
                    ruleId: dbResult.rows[0].id,
                    ruleText: ruleText,
                    cost: aiResult.coin_cost,
                    payload: aiResult.action_payload
                });

            } catch (error) {
                // AGORA SIM VEREMOS O ERRO REAL NO TERMINAL
                console.error("\n[ERRO DETALHADO NO SERVIDOR]:", error);
                sendToClient(ws, 'error', { message: 'A IA falhou ao avaliar a regra.' });
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