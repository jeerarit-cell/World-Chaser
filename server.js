const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// บอกให้ Server ส่งไฟล์จากโฟลเดอร์ public ไปยังหน้าเว็บ
app.use(express.static(path.join(__dirname, 'public')));

// ข้อมูลสถานะของทั้ง 4 ห้อง
const rooms = {
    '0.001': { players: [], timer: 10, isLive: false, round: 125, winnerIdx: -1 },
    '0.01':  { players: [], timer: 10, isLive: false, round: 125, winnerIdx: -1 },
    '0.1':   { players: [], timer: 10, isLive: false, round: 125, winnerIdx: -1 },
    '1.0':   { players: [], timer: 10, isLive: false, round: 125, winnerIdx: -1 }
};

io.on('connection', (socket) => {
    console.log('มีผู้เล่นเชื่อมต่อ:', socket.id);

    // เมื่อผู้เล่นกดปุ่ม JOIN และส่งค่าเงินรางวัลกับชื่อมา
    socket.on('join_room', ({ fee, name }) => {
        const roomKey = fee.toString();
        if (!rooms[roomKey]) return;

        // ให้ Socket ย้ายเข้าไปอยู่ในกลุ่ม (Room) ตามราคาที่เลือก
        socket.join(roomKey);
        
        // ตรวจสอบว่ามีชื่อนี้ในห้องหรือยัง ถ้าไม่มีให้เพิ่มเข้าไป
        if (!rooms[roomKey].players.find(p => p.id === socket.id)) {
            rooms[roomKey].players.push({ id: socket.id, name: name });
        }

        // แจ้งทุกคนในห้องนั้นว่ารายชื่อผู้เล่นอัปเดตแล้ว
        io.to(roomKey).emit('update_players', rooms[roomKey].players);

        // เงื่อนไขเริ่มเกม: ถ้าคนครบ 2 คน และห้องยังไม่ "Live" (ยังไม่รันเกม)
        if (rooms[roomKey].players.length >= 2 && !rooms[roomKey].isLive) {
            startCountdown(roomKey);
        }
    });

    // ระบบแชทแยกตามห้อง
    socket.on('send_chat', ({ fee, user, msg }) => {
        io.to(fee.toString()).emit('receive_chat', { user, msg });
    });

    socket.on('disconnect', () => {
        console.log('ผู้เล่นออกจากการเชื่อมต่อ');
    });
});

// ฟังก์ชันนับถอยหลังและการสุ่มผู้ชนะ
function startCountdown(roomKey) {
    let room = rooms[roomKey];
    room.isLive = true; // เปิดสวิตช์ว่าเกมกำลังทำงาน
    room.timer = 10;    // เริ่มนับที่ 10 วินาที

    const interval = setInterval(() => {
        room.timer--;
        
        // ส่งเลขวินาทีไปให้ผู้เล่นทุกคนในห้องเห็นพร้อมกัน
        io.to(roomKey).emit('timer_update', room.timer);

        if (room.timer <= 0) {
            clearInterval(interval); // หยุดนับถอยหลัง

            // การสุ่มผู้ชนะ (ทำที่ Server เพื่อความปลอดภัย)
            const winnerIdx = Math.floor(Math.random() * room.players.length);
            const winner = room.players[winnerIdx];

            // ส่งผลลัพธ์ไปให้ทุกคนในห้องรัน Animation
            io.to(roomKey).emit('game_result', { winnerIdx, winner });

            // รอ 5 วินาทีเพื่อให้ Animation จบ แล้วทำการ Reset ห้องเพื่อเริ่มรอบใหม่
            setTimeout(() => {
                room.players = [];
                room.isLive = false;
                room.round++;
                io.to(roomKey).emit('reset_game', { round: room.round });
            }, 8000);
        }
    }, 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server กำลังรันที่พอร์ต ${PORT}`));
