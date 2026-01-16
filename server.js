require('dotenv').config();
const express = require('express');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const cors = require('cors');

const app = express();
app.use(cors());
const server = require('http').createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- ฐานข้อมูล MongoDB ---
const userSchema = new mongoose.Schema({
    wallet: { type: String, required: true, unique: true },
    username: String,
    lastSeen: { type: Date, default: Date.now }
});

const historySchema = new mongoose.Schema({
    room: String,
    players: [String],
    winner: String,
    winnerWallet: String,
    prize: Number,
    txHash: String,
    createdAt: { type: Date, default: Date.now, expires: 604800 } // ลบเองใน 7 วัน
});

const User = mongoose.model('User', userSchema);
const History = mongoose.model('History', historySchema);

// --- ตั้งค่า Blockchain (World Chain) ---
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const adminWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const WLD_ABI = ["function transfer(address to, uint256 amount) public returns (bool)"];
const wldContract = new ethers.Contract(process.env.WLD_TOKEN_ADDRESS, WLD_ABI, adminWallet);

// --- สถานะห้องเกม ---
const rooms = {
    "0.001": { players: [], status: "waiting", countdown: 10, timer: null },
    "0.01":  { players: [], status: "waiting", countdown: 10, timer: null },
    "0.1":   { players: [], status: "waiting", countdown: 10, timer: null },
    "1.0":   { players: [], status: "waiting", countdown: 10, timer: null }
};

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ MongoDB Connected"));

io.on('connection', (socket) => {
    // ดึงชื่อและกระเป๋าออโต้จากหน้าบ้าน
    socket.on('auth_user', async ({ wallet, username }) => {
        const user = await User.findOneAndUpdate(
            { wallet }, { username, lastSeen: Date.now() }, { upsert: true, new: true }
        );
        socket.emit('user_ready', user);
    });

    socket.on('join_room', async ({ room, wallet }) => {
        socket.join(room);
        const user = await User.findOne({ wallet });
        if (!user) return;

        const currentRoom = rooms[room];
        if (!currentRoom.players.find(p => p.wallet === wallet)) {
            currentRoom.players.push({ 
                wallet, 
                username: user.username, 
                isReady: false, 
                socketId: socket.id 
            });
        }
        io.to(room).emit('update_players', currentRoom.players);
    });

    socket.on('player_paid', async ({ room, wallet, txHash }) => {
        const currentRoom = rooms[room];
        const player = currentRoom.players.find(p => p.wallet === wallet);
        
        if (player && !player.isReady) {
            player.isReady = true;
            player.txHash = txHash;
            
            const readyPlayers = currentRoom.players.filter(p => p.isReady);
            if (readyPlayers.length >= 2 && currentRoom.status === "waiting") {
                startCountdown(room);
            }
        }
        io.to(room).emit('update_players', currentRoom.players);
    });
});

function startCountdown(roomKey) {
    const room = rooms[roomKey];
    if (room.timer) return;
    room.status = "counting";

    room.timer = setInterval(() => {
        room.countdown--;
        io.to(roomKey).emit('timer_update', room.countdown);
        if (room.countdown <= 0) {
            clearInterval(room.timer);
            room.timer = null;
            runGameLogic(roomKey);
        }
    }, 1000);
}

async function runGameLogic(roomKey) {
    const room = rooms[roomKey];
    const contestants = room.players.filter(p => p.isReady);
    if (contestants.length < 2) {
        room.status = "waiting";
        room.countdown = 10;
        return;
    }

    const winner = contestants[Math.floor(Math.random() * contestants.length)];
    const totalPool = parseFloat(roomKey) * contestants.length;
    const prizeAmount = totalPool * 0.85;

    io.to(roomKey).emit('game_result', { winner: winner.username, wallet: winner.wallet, prize: prizeAmount });

    try {
        const tx = await wldContract.transfer(winner.wallet, ethers.parseUnits(prizeAmount.toFixed(8), 18));
        await History.create({
            room: roomKey, players: contestants.map(p => p.wallet),
            winner: winner.username, winnerWallet: winner.wallet,
            prize: prizeAmount, txHash: tx.hash
        });
    } catch (err) { console.error("Payout Error:", err); }

    setTimeout(() => {
        room.players = room.players.filter(p => !p.isReady);
        room.status = "waiting";
        room.countdown = 10;
        io.to(roomKey).emit('update_players', room.players);
    }, 5000);
}

server.listen(process.env.PORT || 3000, () => console.log("🚀 Server running"));
