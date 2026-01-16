const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ข้อมูลสถานะของทั้ง 4 ห้อง
const rooms = {
    '0.001': { players: [], timer: 10, isLive: false, round: 125 },
    '0.01':  { players: [], timer: 10, isLive: false, round: 125 },
    '0.1':   { players: [], timer: 10, isLive: false, round: 125 },
    '1.0':   { players: [], timer: 10, isLive: false, round: 125 }
};

io.on('connection', (socket) => {
    // 1. เข้า Lobby (สถานะ: มาส่อง)
    socket.on('join_room', ({ fee, name }) => {
        const roomKey = fee.toString();
        if (!rooms[roomKey]) return;

        socket.join(roomKey);
        
        // เช็กคนซ้ำ ถ้าไม่มีให้เพิ่มเข้าแบบ isReady: false
        if (!rooms[roomKey].players.find(p => p.id === socket.id)) {
            rooms[roomKey].players.push({ 
                id: socket.id, 
                name: name, 
                isReady: false 
            });
        }
        updateAndBroadcast(roomKey);
    });

    // 2. กดปุ่ม PLAY (สถานะ: ยืนยันการเล่น)
    socket.on('player_confirm_play', ({ fee }) => {
        const roomKey = fee.toString();
        const room = rooms[roomKey];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.isReady) {
            player.isReady = true; // ล็อกสถานะ หลุดแล้วชื่อไม่หาย
            
            updateAndBroadcast(roomKey);

            // เงื่อนไขเริ่มเกม: คน Ready >= 2 และห้องยังไม่ Live
            const readyPlayers = room.players.filter(p => p.isReady);
            if (readyPlayers.length >= 2 && !room.isLive) {
                startCountdown(roomKey);
            }
        }
    });

    socket.on('send_chat', ({ fee, user, msg }) => {
        io.to(fee.toString()).emit('receive_chat', { user, msg });
    });

    // 3. จัดการคนหลุด (Disconnect) ตามเงื่อนไขคุณ
    socket.on('disconnecting', () => {
        socket.rooms.forEach(roomKey => {
            const room = rooms[roomKey];
            if (room) {
                const player = room.players.find(p => p.id === socket.id);
                // ถ้ายังไม่กด PLAY (isReady: false) ให้ลบชื่อออกทันที
                if (player && !player.isReady) {
                    room.players = room.players.filter(p => p.id !== socket.id);
                    updateAndBroadcast(roomKey);
                }
                // ถ้ากด PLAY แล้ว (isReady: true) ไม่ต้องทำอะไร ปล่อยชื่อค้างไว้จนจบเกม
            }
        });
    });
});

function updateAndBroadcast(roomKey) {
    // ส่งข้อมูลผู้เล่นทั้งหมดในห้องนั้น
    io.to(roomKey).emit('update_players', rooms[roomKey].players);
    
    // ส่งสรุปจำนวนคนทุกห้องให้ทุกคน (สำหรับหน้า Lobby)
    const stats = {};
    for (const key in rooms) {
        stats[key] = {
            total: rooms[key].players.length,
            ready: rooms[key].players.filter(p => p.isReady).length,
            isLive: rooms[key].isLive
        };
    }
    io.emit('rooms_update', stats);
}

function startCountdown(roomKey) {
    let room = rooms[roomKey];
    room.isLive = true;
    room.timer = 10;

    const interval = setInterval(() => {
        room.timer--;
        io.to(roomKey).emit('timer_update', room.timer);

        if (room.timer <= 0) {
            clearInterval(interval);

            // สุ่มเฉพาะคนที่ Ready
            const readyPlayers = room.players.filter(p => p.isReady);
            if (readyPlayers.length >= 2) {
                const winnerIdx = Math.floor(Math.random() * readyPlayers.length);
                const winner = readyPlayers[winnerIdx];

                // ค้นหา Index จริงในกระดานของ Client (ส่งเฉพาะคน Ready ไปสุ่ม)
                io.to(roomKey).emit('game_result', { 
                    winnerIdx: winnerIdx, // สุ่มจากลำดับคน Ready
                    winner: winner 
                });
            }

            // รอ 8 วินาทีแล้วล้างกระดาน (Reset ทั้งคนอยู่และคนหลุด)
            setTimeout(() => {
                room.players = [];
                room.isLive = false;
                room.round++;
                io.to(roomKey).emit('reset_game', { round: room.round });
                updateAndBroadcast(roomKey);
            }, 8000);
        }
    }, 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
