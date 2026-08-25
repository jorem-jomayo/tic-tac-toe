(function() {
    // ---------- State ----------
    const state = {
        board: [],            // flat array, length = size * size
        size: 3,              // 3, 5, or 7
        currentPlayer: 'X',
        gameOver: false,
        winner: null,
        winCombo: null,       // array of indices (length = size)
        scores: { X: 0, O: 0 },
        // multiplayer
        peer: null,
        conn: null,
        isHost: false,
        myPlayerMark: null,
        connected: false,
    };

    // DOM refs
    const boardEl = document.getElementById('board');
    const statusEl = document.getElementById('status');
    const turnIndicator = document.getElementById('turnIndicator');
    const turnHighlight = document.getElementById('turnHighlight');
    const turnText = document.getElementById('turnText');
    const scoreXEl = document.getElementById('scoreX');
    const scoreOEl = document.getElementById('scoreO');
    const resetBtn = document.getElementById('resetBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const lobby = document.getElementById('lobby');
    const gameArea = document.getElementById('gameArea');
    const hostBtn = document.getElementById('hostBtn');
    const joinBtn = document.getElementById('joinBtn');
    const joinInput = document.getElementById('joinInput');
    const hostIdDisplay = document.getElementById('hostIdDisplay');
    const roomIdText = document.getElementById('roomIdText');
    const copyIdBtn = document.getElementById('copyIdBtn');
    const connectionStatus = document.getElementById('connectionStatus');

    // Size selector
    const sizeBtns = document.querySelectorAll('.size-btn');

    // ---------- Board size selection ----------
    function setBoardSize(size) {
        state.size = size;
        sizeBtns.forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.size) === size);
        });
    }

    sizeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.connected) return;
            setBoardSize(parseInt(btn.dataset.size));
        });
    });

    // ---------- Render board ----------
    function renderBoard() {
        const size = state.size;
        boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
        boardEl.className = `board size-${size}`;
        boardEl.innerHTML = '';
        const total = size * size;
        for (let i = 0; i < total; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.index = i;
            const mark = state.board[i];
            if (mark) {
                cell.textContent = mark === 'X' ? '✕' : '◯';
                cell.classList.add('taken', mark === 'X' ? 'x-mark' : 'o-mark');
            }
            if (state.winCombo && state.winCombo.includes(i)) {
                cell.classList.add('win-cell');
            }
            cell.addEventListener('click', () => handleCellClick(i));
            boardEl.appendChild(cell);
        }
    }

    function updateUI() {
        scoreXEl.textContent = state.scores.X;
        scoreOEl.textContent = state.scores.O;

        if (state.gameOver) {
            if (state.winner === 'X') {
                turnHighlight.textContent = '✕';
                turnHighlight.className = 'highlight x-turn';
                turnText.textContent = ' wins! 🎉';
            } else if (state.winner === 'O') {
                turnHighlight.textContent = '◯';
                turnHighlight.className = 'highlight o-turn';
                turnText.textContent = ' wins! 🎉';
            } else if (state.winner === 'draw') {
                turnHighlight.textContent = '—';
                turnHighlight.className = 'highlight';
                turnText.textContent = " It's a draw!";
            }
        } else {
            turnHighlight.textContent = state.currentPlayer === 'X' ? '✕' : '◯';
            turnHighlight.className = `highlight ${state.currentPlayer === 'X' ? 'x-turn' : 'o-turn'}`;
            turnText.textContent = "'s turn";
        }

        if (state.gameOver) {
            if (state.winner === 'X') {
                statusEl.textContent = '✕ wins the game!';
                statusEl.className = 'status win';
            } else if (state.winner === 'O') {
                statusEl.textContent = '◯ wins the game!';
                statusEl.className = 'status win';
            } else if (state.winner === 'draw') {
                statusEl.textContent = 'The game ended in a draw.';
                statusEl.className = 'status draw';
            }
        } else {
            statusEl.textContent = `Player ${state.currentPlayer === 'X' ? '✕' : '◯'}, make your move.`;
            statusEl.className = 'status';
        }
        renderBoard();
    }

    // ---------- Win detection (size-dependent) ----------
    function checkGameState() {
        const size = state.size;
        const board = state.board;
        function checkLine(r, c, dr, dc) {
            const first = board[r * size + c];
            if (!first) return null;
            let indices = [];
            for (let i = 0; i < size; i++) {
                const nr = r + i * dr;
                const nc = c + i * dc;
                if (nr < 0 || nr >= size || nc < 0 || nc >= size) return null;
                if (board[nr * size + nc] !== first) return null;
                indices.push(nr * size + nc);
            }
            return { winner: first, indices };
        }

        for (let r = 0; r < size; r++) {
            const result = checkLine(r, 0, 0, 1);
            if (result) return result;
        }
        for (let c = 0; c < size; c++) {
            const result = checkLine(0, c, 1, 0);
            if (result) return result;
        }
        const diag1 = checkLine(0, 0, 1, 1);
        if (diag1) return diag1;
        const diag2 = checkLine(0, size - 1, 1, -1);
        if (diag2) return diag2;

        if (board.every(cell => cell !== null)) {
            return { winner: 'draw', indices: null };
        }
        return null;
    }

    // ---------- Game actions ----------
    function resetGameLocally() {
        const size = state.size;
        state.board = Array(size * size).fill(null);
        state.currentPlayer = 'X';
        state.gameOver = false;
        state.winner = null;
        state.winCombo = null;
        updateUI();
        if (state.conn && state.conn.open) {
            state.conn.send({
                type: 'reset',
                size: state.size,
                board: state.board,
                currentPlayer: state.currentPlayer,
                gameOver: state.gameOver,
                winner: state.winner,
                winCombo: state.winCombo,
                scores: state.scores,
            });
        }
    }

    function handleCellClick(index) {
        if (state.gameOver) return;
        if (state.board[index] !== null) return;
        if (state.currentPlayer !== state.myPlayerMark) {
            statusEl.textContent = "Wait for your opponent!";
            return;
        }
        state.board[index] = state.currentPlayer;
        const result = checkGameState();
        if (result) {
            state.gameOver = true;
            state.winner = result.winner;
            state.winCombo = result.indices;
            if (result.winner !== 'draw') {
                state.scores[result.winner]++;
            }
        } else {
            state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X';
        }
        updateUI();
        if (state.conn && state.conn.open) {
            state.conn.send({
                type: 'move',
                index: index,
                currentPlayer: state.currentPlayer,
                board: state.board,
                gameOver: state.gameOver,
                winner: state.winner,
                winCombo: state.winCombo,
                scores: state.scores,
                size: state.size,
            });
        }
    }

    function applyRemoteState(data) {
        state.size = data.size || 3;
        state.board = data.board.slice();
        state.currentPlayer = data.currentPlayer;
        state.gameOver = data.gameOver;
        state.winner = data.winner;
        state.winCombo = data.winCombo ? data.winCombo.slice() : null;
        state.scores = { X: data.scores.X, O: data.scores.O };
        const expected = state.size * state.size;
        if (state.board.length !== expected) {
            state.board = Array(expected).fill(null);
        }
        updateUI();
    }

    // ---------- **UPDATED** PeerJS setup with better STUN/TURN ----------
    function setupPeer() {
        state.peer = new Peer(undefined, {
            debug: 2,
            config: {
                iceServers: [
                    // Google's public STUN servers (improves NAT traversal)
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    // Optional free TURN fallback (uncomment if needed)
                    // { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                    // { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
                ]
            }
        });

        state.peer.on('open', (id) => {
            console.log('My peer ID:', id);
        });

        state.peer.on('connection', (conn) => {
            if (state.conn) {
                conn.close();
                return;
            }
            state.conn = conn;
            state.isHost = true;
            state.myPlayerMark = 'X';
            setupConnection(conn);
        });

        state.peer.on('error', (err) => {
            console.error(err);
            connectionStatus.textContent = 'Error: ' + err.message;
        });
    }

    // ---------- Connection handler ----------
    function setupConnection(conn) {
        conn.on('open', () => {
            state.connected = true;
            lobby.classList.add('hidden');
            gameArea.classList.remove('hidden');
            connectionStatus.textContent = 'Connected!';
            if (state.isHost) {
                state.currentPlayer = 'X';
                state.myPlayerMark = 'X';
                state.board = Array(state.size * state.size).fill(null);
                state.gameOver = false;
                state.winner = null;
                state.winCombo = null;
                updateUI();
                conn.send({
                    type: 'sync',
                    size: state.size,
                    board: state.board,
                    currentPlayer: state.currentPlayer,
                    gameOver: state.gameOver,
                    winner: state.winner,
                    winCombo: state.winCombo,
                    scores: state.scores,
                });
            } else {
                state.currentPlayer = 'X';
                state.myPlayerMark = 'O';
            }
            updateUI();
        });

        conn.on('data', (data) => {
            if (data.type === 'move') {
                applyRemoteState(data);
            } else if (data.type === 'reset') {
                state.board = Array(state.size * state.size).fill(null);
                state.currentPlayer = 'X';
                state.gameOver = false;
                state.winner = null;
                state.winCombo = null;
                updateUI();
            } else if (data.type === 'sync') {
                state.size = data.size || 3;
                applyRemoteState(data);
                state.myPlayerMark = 'O';
                updateUI();
            } else if (data.type === 'disconnect') {
                connectionStatus.textContent = 'Opponent disconnected.';
                state.connected = false;
                gameArea.classList.add('hidden');
                lobby.classList.remove('hidden');
                state.board = Array(state.size * state.size).fill(null);
                state.scores = { X: 0, O: 0 };
                updateUI();
            }
        });

        conn.on('close', () => {
            connectionStatus.textContent = 'Connection closed.';
            state.connected = false;
            gameArea.classList.add('hidden');
            lobby.classList.remove('hidden');
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            connectionStatus.textContent = 'Connection error.';
        });
    }

    // ---------- Host / Join ----------
    function hostGame() {
        if (state.peer) {
            state.peer.destroy();
        }
        setupPeer();
        state.isHost = true;
        state.peer.on('open', (id) => {
            roomIdText.textContent = id;
            hostIdDisplay.style.display = 'block';
            connectionStatus.textContent = 'Share this ID with your opponent.';
        });
        if (state.peer.id) {
            roomIdText.textContent = state.peer.id;
            hostIdDisplay.style.display = 'block';
            connectionStatus.textContent = 'Share this ID with your opponent.';
        }
        hostBtn.disabled = true;
        hostBtn.textContent = 'Waiting...';
        const size = state.size;
        state.board = Array(size * size).fill(null);
        state.gameOver = false;
        state.winner = null;
        state.winCombo = null;
        state.currentPlayer = 'X';
        updateUI();
    }

    function joinGame() {
        const remoteId = joinInput.value.trim();
        if (!remoteId) {
            connectionStatus.textContent = 'Please enter a room ID.';
            return;
        }
        if (!state.peer) {
            setupPeer();
        }
        if (state.peer.id) {
            connectToPeer(remoteId);
        } else {
            state.peer.on('open', () => {
                connectToPeer(remoteId);
            });
        }
    }

    function connectToPeer(remoteId) {
        const conn = state.peer.connect(remoteId);
        state.isHost = false;
        state.myPlayerMark = 'O';
        setupConnection(conn);
        connectionStatus.textContent = 'Connecting...';
    }

    // ---------- Disconnect ----------
    function disconnect() {
        if (state.conn) {
            state.conn.send({ type: 'disconnect' });
            state.conn.close();
        }
        if (state.peer) {
            state.peer.destroy();
        }
        state.connected = false;
        state.conn = null;
        state.peer = null;
        gameArea.classList.add('hidden');
        lobby.classList.remove('hidden');
        hostIdDisplay.style.display = 'none';
        hostBtn.disabled = false;
        hostBtn.textContent = '🎮 Host Game';
        connectionStatus.textContent = 'Disconnected.';
        const size = state.size;
        state.board = Array(size * size).fill(null);
        state.scores = { X: 0, O: 0 };
        state.currentPlayer = 'X';
        state.gameOver = false;
        state.winner = null;
        state.winCombo = null;
        state.myPlayerMark = null;
        updateUI();
    }

    // ---------- Event listeners ----------
    hostBtn.addEventListener('click', hostGame);
    joinBtn.addEventListener('click', joinGame);
    joinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
    copyIdBtn.addEventListener('click', () => {
        const text = roomIdText.textContent;
        navigator.clipboard.writeText(text).then(() => {
            connectionStatus.textContent = 'ID copied!';
        }).catch(() => {
            const range = document.createRange();
            range.selectNode(roomIdText);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
            connectionStatus.textContent = 'ID copied!';
        });
    });
    resetBtn.addEventListener('click', resetGameLocally);
    disconnectBtn.addEventListener('click', disconnect);

    // ---------- Init ----------
    setupPeer();
    lobby.classList.remove('hidden');
    gameArea.classList.add('hidden');
    setBoardSize(3);
    state.board = Array(9).fill(null);
    state.scores = { X: 0, O: 0 };
    state.currentPlayer = 'X';
    updateUI();

    window.addEventListener('beforeunload', () => {
        if (state.conn) {
            state.conn.send({ type: 'disconnect' });
            state.conn.close();
        }
        if (state.peer) {
            state.peer.destroy();
        }
    });
})();