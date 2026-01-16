const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// --- โครงสร้างข้อมูลห้องเกม ---
const roomTiers = ["0.001", "0.01", "0.1", "1.0"];
let rooms = {};

roomTiers.forEach(tier => {
    rooms[tier] = {
        players: [],
        timeLeft: 15,
        isRunning: false,
        round: 100 + Math.floor(Math.random() * 50)
    };
});

// --- ระบบจัดการลูปของแต่ละห้อง ---
function startRoomTimer(tier) {
    const room = rooms[tier];
    const timer = setInterval(() => {
        if (!room.isRunning) {
            room.timeLeft--;
            io.to(tier).emit('timer_update', room.timeLeft);

            if (room.timeLeft <= 0) {
                if (room.players.length >= 2) {
                    clearInterval(timer);
                    runRoomGame(tier);
                } else {
                    room.timeLeft = 15;
                }
            }
        }
    }, 1000);
}

function runRoomGame(tier) {
    const room = rooms[tier];
    room.isRunning = true;
    
    const winnerIdx = Math.floor(Math.random() * room.players.length);
    io.to(tier).emit('game_result', { winnerIdx: winnerIdx });

    // --- ปรับจาก 10000 (10วิ) เป็น 3000 (3วิ) ---
    setTimeout(() => {
        room.round++;
        room.players = []; 
        room.isRunning = false;
        room.timeLeft = 15;
        
        io.to(tier).emit('reset_game', { round: room.round });
        io.to(tier).emit('update_players', []);
        
        startRoomTimer(tier);
    }, 3000); // พัก 3 วินาทีก่อนเริ่มรอบถัดไป
}

roomTiers.forEach(tier => startRoomTimer(tier));

// --- การเชื่อมต่อ Socket ---
io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const tier = data.fee.toString();
        const room = rooms[tier];

        if (room && !room.isRunning && room.players.length < 12) {
            socket.join(tier);
            const exists = room.players.find(p => p.id === socket.id);
            if (!exists) {
                room.players.push({
                    id: socket.id,
                    name: data.name || "Unknown"
                });
                io.to(tier).emit('update_players', room.players);
            }
        }
    });

    socket.on('send_chat', (data) => {
        const tier = data.fee.toString();
        io.to(tier).emit('receive_chat', data);
    });

    socket.on('disconnect', () => {
        roomTiers.forEach(tier => {
            const room = rooms[tier];
            if (!room.isRunning) {
                const index = room.players.findIndex(p => p.id === socket.id);
                if (index !== -1) {
                    room.players.splice(index, 1);
                    io.to(tier).emit('update_players', room.players);
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (3s Reset Delay)`);
});
