const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ตั้งค่าให้แสดงไฟล์ในโฟลเดอร์ public
app.use(express.static(path.join(__dirname, 'public')));

let rooms = {
    "0.001": { players: [], isRunning: false, round: 125 },
    "0.01": { players: [], isRunning: false, round: 1 },
    "0.1": { players: [], isRunning: false, round: 1 },
    "1.0": { players: [], isRunning: false, round: 1 }
};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-game', (data) => {
        const room = rooms[data.fee];
        if (!room) return;

        // เพิ่มผู้เล่น (ในอนาคตจะเปลี่ยนเป็นการดึงจาก World ID)
        const newPlayer = { id: socket.id, name: data.name };
        room.players.push(newPlayer);

        // แจ้งทุกคนในห้องว่ามีคนเข้าเพิ่ม
        io.emit('update-room', {
            fee: data.fee,
            players: room.players.map(p => p.name),
            prize: (room.players.length * data.fee * 0.85).toFixed(4)
        });

        // ถ้าครบ 2 คน และยังไม่เริ่มเกม ให้เริ่มนับถอยหลัง
        if (room.players.length >= 2 && !room.isRunning) {
            startCountdown(data.fee);
        }
    });

    socket.on('disconnect', () => {
        // จัดการเมื่อคนหลุด (Optional: ลบออกจาก Array)
    });
});

function startCountdown(fee) {
    const room = rooms[fee];
    room.isRunning = true;
    let count = 10;

    let timer = setInterval(() => {
        io.emit('timer-tick', { fee, count });
        if (count <= 0) {
            clearInterval(timer);
            calculateWinner(fee);
        }
        count--;
    }, 1000);
}

function calculateWinner(fee) {
    const room = rooms[fee];
    const winnerIdx = Math.floor(Math.random() * room.players.length);
    const prize = (room.players.length * fee * 0.85).toFixed(4);
    
    // ส่งผลให้ทุกคน
    io.emit('game-result', {
        fee: fee,
        winnerIndex: winnerIdx,
        winnerName: room.players[winnerIdx].name,
        prize: prize,
        round: room.round
    });

    // Reset ห้องหลังจบเกม 10 วินาที
    setTimeout(() => {
        room.players = [];
        room.isRunning = false;
        room.round++;
        io.emit('update-room', { fee, players: [], prize: "0.0000" });
    }, 10000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
