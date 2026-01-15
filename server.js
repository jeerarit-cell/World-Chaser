const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// สร้างสถานะแยกแต่ละห้อง
const rooms = {
    '0.001': { players: [], timer: 10, isLive: false, round: 100 },
    '0.01':  { players: [], timer: 10, isLive: false, round: 100 },
    '0.1':   { players: [], timer: 10, isLive: false, round: 100 },
    '1.0':   { players: [], timer: 10, isLive: false, round: 100 }
};

io.on('connection', (socket) => {
    socket.on('join_room', ({ fee, name }) => {
        const roomKey = fee.toString();
        if (!rooms[roomKey]) return;

        // เข้าสู่ห้อง (Socket.io Room)
        socket.join(roomKey);
        
        // เช็คว่าคนนี้อยู่ในรายชื่อผู้เล่นหรือยัง
        if (!rooms[roomKey].players.find(p => p.id === socket.id)) {
            rooms[roomKey].players.push({ id: socket.id, name: name });
        }

        // ส่งข้อมูลผู้เล่นในห้องนั้นๆ ให้ทุกคนในห้องเห็น
        io.to(roomKey).emit('update_players', rooms[roomKey].players);

        // ถ้าครบ 2 คน และยังไม่เริ่มนับถอยหลัง
        if (rooms[roomKey].players.length >= 2 && !rooms[roomKey].isLive) {
            startCountdown(roomKey);
        }
    });

    socket.on('disconnect', () => {
        // ลบผู้เล่นออกเมื่อหลุดการเชื่อมต่อ (Optional)
    });
});

function startCountdown(roomKey) {
    let room = rooms[roomKey];
    room.isLive = true;
    room.timer = 10;

    const itv = setInterval(() => {
        room.timer--;
        io.to(roomKey).emit('timer_update', room.timer);

        if (room.timer <= 0) {
            clearInterval(itv);
            const winnerIdx = Math.floor(Math.random() * room.players.length);
            const winner = room.players[winnerIdx];
            
            io.to(roomKey).emit('game_result', { winnerIdx, winner });

            // Reset ห้องหลังจากจบเกม 5 วินาที
            setTimeout(() => {
                room.players = [];
                room.isLive = false;
                room.round++;
                io.to(roomKey).emit('reset_game', { round: room.round });
            }, 5000);
        }
    }, 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
