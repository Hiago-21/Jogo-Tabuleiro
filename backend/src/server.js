const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./config/db');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configuração do WebSocket permitindo acesso do cliente Godot
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log(`[+] Novo socket conectado: ${socket.id}`);

    // EVENTO 1: Criar uma nova sala
    socket.on('create_room', async (data, callback) => {
        try {
            // Gera um código alfanumérico único de 5 caracteres
            const roomCode = crypto.randomBytes(3).toString('hex').toUpperCase().substring(0, 5);

            // Insere a nova partida no banco
            const result = await db.query(
                'INSERT INTO matches (room_code, status) VALUES ($1, $2) RETURNING id, room_code',
                [roomCode, 'waiting']
            );

            const match = result.rows[0];
            socket.join(roomCode); // O host entra na "sala" do Socket.io

            console.log(`[ROOM] Sala ${roomCode} criada.`);
            // Retorna o sucesso e o código para o Frontend
            callback({ success: true, roomCode: match.room_code }); 
            
        } catch (error) {
            console.error("Erro ao criar sala:", error);
            callback({ success: false, message: 'Erro interno ao criar a sala' });
        }
    });

    // EVENTO 2: Entrar em uma sala existente
    socket.on('join_room', async (data, callback) => {
        const { roomCode, username } = data;

        try {
            // Valida se a sala existe
            const matchResult = await db.query(
                'SELECT id, status FROM matches WHERE room_code = $1',
                [roomCode]
            );

            if (matchResult.rows.length === 0) {
                return callback({ success: false, message: 'Sala não encontrada.' });
            }

            const match = matchResult.rows[0];

            // Cria o usuário de forma simplificada (MVP)
            const userResult = await db.query(
                'INSERT INTO users (username) VALUES ($1) RETURNING id',
                [username]
            );
            const userId = userResult.rows[0].id;

            // Insere o jogador no estado da partida com 10 HP e 5 Moedas (Default no SQL)
            await db.query(
                'INSERT INTO match_players (match_id, user_id) VALUES ($1, $2)',
                [match.id, userId]
            );

            socket.join(roomCode);
            
            // Avisa aos outros jogadores que alguém entrou
            io.to(roomCode).emit('player_joined', { username, message: 'entrou na partida!' });
            
            console.log(`[ROOM] ${username} conectou na sala ${roomCode}`);
            callback({ success: true, matchId: match.id, userId });

        } catch (error) {
            console.error("Erro ao entrar na sala:", error);
            callback({ success: false, message: 'Erro interno ao entrar na sala.' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] Socket desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});