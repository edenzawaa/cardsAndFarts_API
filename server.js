import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';

const PORT = 3000;

// Load .env variables manually for Node.js
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const index = trimmed.indexOf('=');
      if (index !== -1) {
        const key = trimmed.substring(0, index).trim();
        const val = trimmed.substring(index + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key) {
          process.env[key] = val;
        }
      }
    }
  });
}

// In-memory cache for Google Drive file IDs
let cachedFileIds = [];
let cacheExpiryTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Helper to extract the folder ID if the user provides a full Google Drive URL
function extractFolderId(input) {
  if (!input) return '';
  const trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (folderMatch && folderMatch[1]) {
      return folderMatch[1];
    }
    const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (queryMatch && queryMatch[1]) {
      return queryMatch[1];
    }
  }
  return trimmed;
}

async function fetchGoogleDriveFileIds() {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  const rawFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const folderId = extractFolderId(rawFolderId);

  if (!apiKey || !folderId) {
    console.warn("[Google Drive] Missing GOOGLE_DRIVE_API_KEY or GOOGLE_DRIVE_FOLDER_ID in .env");
    return [];
  }

  if (Date.now() < cacheExpiryTime && cachedFileIds.length > 0) {
    return cachedFileIds;
  }

  console.log("[Google Drive] Fetching fresh file list from Google Drive API...");
  try {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType contains 'image/'`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&key=${apiKey}&fields=files(id)&pageSize=1000`;

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Drive API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const files = data.files || [];
    const fileIds = files.map(file => file.id).filter(Boolean);

    if (fileIds.length === 0) {
      console.warn("[Google Drive] No images found in the specified folder");
      return [];
    }

    console.log(`[Google Drive] Successfully indexed ${fileIds.length} memes`);
    
    cachedFileIds = fileIds;
    cacheExpiryTime = Date.now() + CACHE_TTL_MS;
    
    return cachedFileIds;
  } catch (err) {
    console.error("[Google Drive] Error fetching file list:", err.message);
    return cachedFileIds;
  }
}

// Helper to serve local fallback image
function serveLocalFallback(res) {
  console.log("[API] Serving local fallback image.");
  const fallbackPath = path.join(process.cwd(), '..', 'frontend', 'src', 'assets', 'test.jpg');
  
  fs.readFile(fallbackPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Meme template not found');
    } else {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      res.end(data);
    }
  });
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/meme') {
    const specificId = url.searchParams.get('id');

    if (specificId && specificId.startsWith('mock-')) {
      serveLocalFallback(res);
      return;
    }

    const fileIds = await fetchGoogleDriveFileIds();

    if (fileIds.length > 0) {
      let targetId = specificId;
      if (!targetId || !fileIds.includes(targetId)) {
        const randomIndex = Math.floor(Math.random() * fileIds.length);
        targetId = fileIds[randomIndex];
      }
      
      const directViewUrl = `https://lh3.googleusercontent.com/d/${targetId}`;
      const proxiedUrl = `https://wsrv.nl/?url=${encodeURIComponent(directViewUrl)}&n=-1`;

      console.log(`[API] Redirecting to CDN-proxied Google Drive image: ${targetId}`);
      res.writeHead(302, { 'Location': proxiedUrl });
      res.end();
    } else {
      serveLocalFallback(res);
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// --- GAME CAPTIONS LIST ---
const CAPTIONS = [
  "When you push a bug to production and it somehow fixes a different bug.",
  "Me explaining to my family how I make a living playing with googly-eyed 3D avatars.",
  "The face you make when the card clips right through the palm tree.",
  "POV: You joined a lobby from 8 different browser tabs to test multiplayer.",
  "When you try to code at 3 AM and the compiler starts speaking in emojis.",
  "When the server restarts but you forgot to write down the 4-letter room code.",
  "Me pretending to understand WebGL depth testing and vector math.",
  "When the host starts the game but you were still typing your silly name.",
  "When you click a card expecting a high-quality meme but it's just the local fallback JPEG.",
  "When your code compiles on the first try and you immediately get suspicious.",
  "Me watching other players' googly eyes wiggle directly above my cards.",
  "When you write a single line of CSS and it breaks the entire page layout.",
  "The developer after writing 'should work' in the commit message.",
  "When you close 50 stackoverflow tabs after finally fixing a typo.",
  "Me trying to explain to the AI assistant that I wanted a sand-yellow beach, not a dark void.",
  "When someone asks you to explain your code that you wrote two weeks ago.",
  "When you realize the bug was caused by a capital letter in your config file.",
  "The face you make when the internet drops right as you are winning the game.",
  "When the product manager asks for a 'quick, simple 5-minute change'.",
  "Me trying to act cool while my browser tab consumes 4GB of RAM rendering 3D hats.",
  "When you find the bug and it was a line of code you wrote yesterday.",
  "When you delete a comment and the entire program stops compiling.",
  "The local dev server when you save a file 10 times in 2 seconds.",
  "When your friend joins the lobby and instantly names themselves 'Silly Boss'.",
  "Me trying to look professional while playing cards on a floating cartoon island."
];

// --- MULTIPLAYER LOBBY SYSTEM ---
const wss = new WebSocketServer({ server });
const lobbies = new Map(); // lobbyId -> lobbyState

const PLAYER_COLORS = [
  '#ff4081', // Hot Pink
  '#00e676', // Lime Green
  '#29b6f6', // Light Blue
  '#ffca28', // Yellow-Gold
  '#ab47bc', // Purple
  '#ff7043', // Orange
  '#26a69a', // Teal
  '#ec407a'  // Rose Pink
];

function generateLobbyId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Authoritative and secure lobby state sender
function sendLobbyState(lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  const playersList = lobby.players.map(p => ({
    id: p.id,
    name: p.name,
    isHost: p.id === lobby.hostId,
    color: p.color,
    points: p.points,
    hasSubmitted: lobby.submissions.some(s => s.playerId === p.id),
    hoveredCard: p.hoveredCard,
    handSize: p.hand.length
  }));

  const activePlayer = lobby.players[lobby.activePlayerIdx];

  lobby.players.forEach(player => {
    if (player.ws && player.ws.readyState === 1) {
      player.ws.send(JSON.stringify({
        type: 'LOBBY_STATE',
        lobbyId,
        players: playersList,
        gameStarted: lobby.gameStarted,
        phase: lobby.phase,
        activePlayerIdx: lobby.activePlayerIdx,
        currentCaption: lobby.currentCaption,
        captionRevealTimer: lobby.captionRevealTimer,
        submissionTimer: lobby.submissionTimer,
        revealIndex: lobby.revealIndex,
        winnerId: lobby.winnerId,
        
        // Secure caption options: only send to the active drawer during choosing phase
        captionOptions: (lobby.phase === 'CHOOSING_CAPTION' && activePlayer && player.id === activePlayer.id)
          ? (lobby.captionOptions || [])
          : [],

        // Anti-cheating security: only send this player's own hand
        hand: player.hand,
        
        // Secure submissions: Anonymous during reveal, owners shown in Round Results
        submissions: lobby.phase === 'ROUND_RESULTS' 
          ? lobby.submissions.map(s => {
              const owner = lobby.players.find(p => p.id === s.playerId);
              return {
                memeId: s.memeId,
                playerName: owner ? owner.name : 'Unknown',
                averageRating: s.averageRating
              };
            })
          : lobby.submissions.map(s => ({
              memeId: s.memeId,
              ratingsCount: Object.keys(s.ratings).length,
              averageRating: s.averageRating,
              hasVoted: s.ratings[player.id] !== undefined
            }))
      }));
    }
  });
}

function handleLeaveLobby(lobbyId, playerId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  // Clear timers if active
  if (lobby.players.length <= 1 && lobby.timerInterval) {
    clearInterval(lobby.timerInterval);
    lobby.timerInterval = null;
  }

  lobby.players = lobby.players.filter(p => p.id !== playerId);

  if (lobby.players.length === 0) {
    lobbies.delete(lobbyId);
    console.log(`[Lobby] Lobby ${lobbyId} deleted because it is empty.`);
  } else {
    if (lobby.hostId === playerId) {
      lobby.hostId = lobby.players[0].id;
    }
    // Adjust activePlayerIdx if out of bounds
    if (lobby.activePlayerIdx >= lobby.players.length) {
      lobby.activePlayerIdx = 0;
    }
    sendLobbyState(lobbyId);
    console.log(`[Lobby] Player ${playerId} left lobby ${lobbyId}.`);
  }
}

// Countdowns
function startCaptionTimer(lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  lobby.captionRevealTimer = 7;
  
  if (lobby.timerInterval) clearInterval(lobby.timerInterval);

  lobby.timerInterval = setInterval(() => {
    const currentLobby = lobbies.get(lobbyId);
    if (!currentLobby || currentLobby.phase !== 'CAPTION_REVEAL') {
      clearInterval(currentLobby?.timerInterval);
      return;
    }

    currentLobby.captionRevealTimer--;

    if (currentLobby.captionRevealTimer <= 0) {
      clearInterval(currentLobby.timerInterval);
      currentLobby.timerInterval = null;
      startSubmissionTimer(lobbyId);
    } else {
      sendLobbyState(lobbyId);
    }
  }, 1000);

  sendLobbyState(lobbyId);
}

function startSubmissionTimer(lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  lobby.phase = 'SUBMITTING_CARDS';
  lobby.submissionTimer = 30;

  if (lobby.timerInterval) clearInterval(lobby.timerInterval);

  lobby.timerInterval = setInterval(() => {
    const currentLobby = lobbies.get(lobbyId);
    if (!currentLobby || currentLobby.phase !== 'SUBMITTING_CARDS') {
      clearInterval(currentLobby?.timerInterval);
      return;
    }

    currentLobby.submissionTimer--;

    if (currentLobby.submissionTimer <= 0) {
      clearInterval(currentLobby.timerInterval);
      currentLobby.timerInterval = null;
      // Auto-submit for anyone who is AFK, and proceed
      autoSubmitAndProceed(lobbyId);
    } else {
      sendLobbyState(lobbyId);
    }
  }, 1000);

  sendLobbyState(lobbyId);
}

function autoSubmitAndProceed(lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  const activePlayer = lobby.players[lobby.activePlayerIdx];
  const submittingPlayers = lobby.players.filter(p => p.id !== activePlayer.id);

  submittingPlayers.forEach(p => {
    const alreadySubmitted = lobby.submissions.some(s => s.playerId === p.id);
    if (!alreadySubmitted && p.hand.length > 0) {
      // Pick a random card from their hand
      const randomIdx = Math.floor(Math.random() * p.hand.length);
      const memeId = p.hand[randomIdx];
      p.hand.splice(randomIdx, 1);

      lobby.submissions.push({
        playerId: p.id,
        memeId: memeId,
        ratings: {}
      });
    }
  });

  // Reset hover cards for everyone in the lobby when transitioning to reveal
  lobby.players.forEach(p => {
    p.hoveredCard = null;
  });

  // Shuffle submissions for anonymity
  shuffleArray(lobby.submissions);

  lobby.phase = 'REVEALING_CARDS';
  lobby.revealIndex = 0;
  sendLobbyState(lobbyId);
  console.log(`[Lobby] Submission timer expired in room ${lobbyId}. Cards shuffled and revealed.`);
}

function calculateRoundResults(lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  let highestRating = -1;
  let roundWinners = [];

  lobby.submissions.forEach(sub => {
    const ratings = Object.values(sub.ratings);
    const sum = ratings.reduce((a, b) => a + b, 0);
    const avg = ratings.length > 0 ? sum / ratings.length : 0;
    sub.averageRating = parseFloat(avg.toFixed(2));

    if (sub.averageRating > highestRating) {
      highestRating = sub.averageRating;
      roundWinners = [sub.playerId];
    } else if (sub.averageRating === highestRating) {
      roundWinners.push(sub.playerId);
    }
  });

  // Award 1 point to each winner
  roundWinners.forEach(winnerId => {
    const player = lobby.players.find(p => p.id === winnerId);
    if (player) {
      player.points += 1;
    }
  });

  // Check if someone hit 5 points
  const gameWinner = lobby.players.find(p => p.points >= 5);
  if (gameWinner) {
    lobby.phase = 'GAME_OVER';
    lobby.winnerId = gameWinner.id;
    console.log(`[Lobby] Game Over in lobby ${lobbyId}. Winner: ${gameWinner.name}`);
  } else {
    lobby.phase = 'ROUND_RESULTS';
  }
}

// Securely draw a card from a lobby's shuffled deck, ensuring no duplicates or reshuffled discards
async function drawCardFromDeck(lobby) {
  // Initialize deck if it doesn't exist (only at the start of a game)
  if (!lobby.deck) {
    console.log(`[Lobby] Initializing fresh deck for lobby ${lobby.id}...`);
    const fileIds = await fetchGoogleDriveFileIds();
    if (fileIds.length > 0) {
      lobby.deck = [...fileIds];
      shuffleArray(lobby.deck);
    } else {
      // Fallback: Generate a large pool of unique mock IDs
      lobby.deck = [];
      for (let i = 0; i < 100; i++) {
        lobby.deck.push(`mock-${i}-${Math.random().toString(36).substring(2, 7)}`);
      }
    }
  }

  // If the deck runs out of cards mid-game, we are allowed to reshuffle the discarded cards.
  // To prevent players from getting duplicates, we exclude any cards currently in players' hands.
  if (lobby.deck.length === 0) {
    console.log(`[Lobby] Deck is empty! Reshuffling discarded cards for lobby ${lobby.id}...`);
    const fileIds = await fetchGoogleDriveFileIds();
    const activeCards = new Set(lobby.players.flatMap(p => p.hand));
    const discardedCards = fileIds.filter(id => !activeCards.has(id));

    if (discardedCards.length > 0) {
      lobby.deck = [...discardedCards];
      shuffleArray(lobby.deck);
      console.log(`[Lobby] Reshuffled ${discardedCards.length} discarded cards back into the deck.`);
    } else {
      // Hard fallback if all catalog cards are currently in play (very small catalog)
      console.log(`[Lobby] No discarded cards available. Refilling deck with unique fallback IDs.`);
      lobby.deck = [];
      for (let i = 0; i < 50; i++) {
        lobby.deck.push(`mock-refill-${i}-${Math.random().toString(36).substring(2, 7)}`);
      }
    }
  }

  // Draw (pop) the top card from the deck
  return lobby.deck.pop();
}

// WebSocket Event Handlers
wss.on('connection', (ws) => {
  console.log('[WebSocket] Client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`[WebSocket] Received: ${data.type}`, data);

      switch (data.type) {
        case 'CREATE_LOBBY': {
          const lobbyId = generateLobbyId();
          const playerId = Math.random().toString(36).substring(2, 9);
          
          const newLobby = {
            id: lobbyId,
            players: [
              {
                id: playerId,
                name: data.playerName || 'Host',
                color: PLAYER_COLORS[0],
                points: 0,
                hand: [],
                hoveredCard: null,
                ws: ws
              }
            ],
            hostId: playerId,
            gameStarted: false,
            phase: 'WAITING_FOR_CAPTION',
            activePlayerIdx: 0,
            currentCaption: null,
            captionRevealTimer: 0,
            submissionTimer: 0,
            revealIndex: -1,
            winnerId: null,
            submissions: [],
            captionOptions: [],
            timerInterval: null
          };

          lobbies.set(lobbyId, newLobby);
          ws.lobbyId = lobbyId;
          ws.playerId = playerId;

          ws.send(JSON.stringify({
            type: 'JOIN_SUCCESS',
            lobbyId,
            playerId
          }));

          sendLobbyState(lobbyId);
          console.log(`[Lobby] Created lobby ${lobbyId} by host ${data.playerName}`);
          break;
        }

        case 'RECONNECT': {
          const targetLobbyId = (data.lobbyId || '').toUpperCase();
          const targetPlayerId = data.playerId;
          const lobby = lobbies.get(targetLobbyId);
          
          if (!lobby) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Lobby not found or expired.' }));
            return;
          }

          const player = lobby.players.find(p => p.id === targetPlayerId);
          if (!player) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Session expired or player not found.' }));
            return;
          }

          // Reconnect successful!
          if (player.disconnectTimeout) {
            clearTimeout(player.disconnectTimeout);
            player.disconnectTimeout = null;
          }
          player.disconnected = false;
          player.ws = ws; // Update socket reference

          ws.lobbyId = targetLobbyId;
          ws.playerId = targetPlayerId;

          ws.send(JSON.stringify({
            type: 'JOIN_SUCCESS',
            lobbyId: targetLobbyId,
            playerId: targetPlayerId
          }));

          sendLobbyState(targetLobbyId);
          console.log(`[Lobby] Player ${player.name} reconnected successfully to lobby ${targetLobbyId}`);
          break;
        }

        case 'JOIN_LOBBY': {
          const targetLobbyId = (data.lobbyId || '').toUpperCase();
          const lobby = lobbies.get(targetLobbyId);
          
          if (!lobby) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Lobby not found.' }));
            return;
          }

          if (lobby.gameStarted) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Game has already started in this lobby.' }));
            return;
          }

          if (lobby.players.length >= 7) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Lobby is full (max 7 players).' }));
            return;
          }

          const playerId = Math.random().toString(36).substring(2, 9);
          const playerColor = PLAYER_COLORS[lobby.players.length % PLAYER_COLORS.length];

          lobby.players.push({
            id: playerId,
            name: data.playerName || `Player ${lobby.players.length + 1}`,
            color: playerColor,
            points: 0,
            hand: [],
            hoveredCard: null,
            ws: ws
          });

          ws.lobbyId = targetLobbyId;
          ws.playerId = playerId;

          ws.send(JSON.stringify({
            type: 'JOIN_SUCCESS',
            lobbyId: targetLobbyId,
            playerId
          }));

          sendLobbyState(targetLobbyId);
          console.log(`[Lobby] Player ${data.playerName} joined lobby ${targetLobbyId}`);
          break;
        }

        case 'START_GAME': {
          const lobby = lobbies.get(ws.lobbyId);
          if (!lobby) return;
          
          if (lobby.hostId !== ws.playerId) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Only the host can start the game.' }));
            return;
          }

          lobby.gameStarted = true;

          // Initialize a fresh deck for this new game
          lobby.deck = null;

          // Deal 5 unique cards to each player from the deck
          for (let p of lobby.players) {
            p.hand = [];
            p.points = 0;
            p.hoveredCard = null;
            for (let j = 0; j < 5; j++) {
              const card = await drawCardFromDeck(lobby);
              p.hand.push(card);
            }
          }

          lobby.activePlayerIdx = 0;
          lobby.phase = 'WAITING_FOR_CAPTION';
          sendLobbyState(ws.lobbyId);
          console.log(`[Lobby] Game started in lobby ${ws.lobbyId}`);
          break;
        }

        case 'DRAW_CAPTION': {
          const lobby = lobbies.get(ws.lobbyId);
          if (!lobby) return;
          if (lobby.phase !== 'WAITING_FOR_CAPTION') return;

          const activePlayer = lobby.players[lobby.activePlayerIdx];
          if (activePlayer.id !== ws.playerId) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Only the designated caption drawer can draw a caption!' }));
            return;
          }

          // Draw two unique random captions
          const options = [];
          while (options.length < 2) {
            const randomCaption = CAPTIONS[Math.floor(Math.random() * CAPTIONS.length)];
            if (!options.includes(randomCaption)) {
              options.push(randomCaption);
            }
          }
          lobby.captionOptions = options;
          lobby.phase = 'CHOOSING_CAPTION';

          console.log(`[Lobby] Caption options drawn in room ${ws.lobbyId}:`, options);
          sendLobbyState(ws.lobbyId);
          break;
        }

        case 'SELECT_CAPTION': {
          const lobby = lobbies.get(ws.lobbyId);
          if (!lobby) return;
          if (lobby.phase !== 'CHOOSING_CAPTION') return;

          const activePlayer = lobby.players[lobby.activePlayerIdx];
          if (activePlayer.id !== ws.playerId) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Only the designated caption drawer can select a caption!' }));
            return;
          }

          const selectedCaption = data.caption;
          if (!lobby.captionOptions || !lobby.captionOptions.includes(selectedCaption)) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid caption selected!' }));
            return;
          }

          lobby.currentCaption = selectedCaption;
          lobby.captionOptions = []; // Clear options
          lobby.phase = 'CAPTION_REVEAL';

          console.log(`[Lobby] Caption selected in room ${ws.lobbyId}: "${selectedCaption}"`);
          
          // Start 7-second countdown
          startCaptionTimer(ws.lobbyId);
          break;
        }

        case 'SUBMIT_CARD': {
          const lobby = lobbies.get(ws.lobbyId);
          if (!lobby) return;
          if (lobby.phase !== 'SUBMITTING_CARDS') return;
          
          const activePlayer = lobby.players[lobby.activePlayerIdx];
          if (activePlayer.id === ws.playerId) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'The caption drawer cannot submit a card!' }));
            return;
          }
          
          const player = lobby.players.find(p => p.id === ws.playerId);
          if (!player) return;

          const alreadySubmitted = lobby.submissions.some(s => s.playerId === player.id);
          if (alreadySubmitted) return;

          const cardIndex = data.cardIndex;
          if (cardIndex >= 0 && cardIndex < player.hand.length) {
            const memeId = player.hand[cardIndex];
            player.hand.splice(cardIndex, 1); // Remove from hand

            lobby.submissions.push({
              playerId: player.id,
              memeId: memeId,
              ratings: {}
            });

            // Reset their hover card since they just submitted
            player.hoveredCard = null;

            console.log(`[Lobby] Player ${player.name} submitted card.`);

            // Check if all submitting players have submitted
            const totalSubmitters = lobby.players.length - 1;
            if (lobby.submissions.length === totalSubmitters) {
              // Stop countdown timer
              if (lobby.timerInterval) {
                clearInterval(lobby.timerInterval);
                lobby.timerInterval = null;
              }
              // Reset hover cards for everyone in the lobby when transitioning to reveal
              lobby.players.forEach(p => {
                p.hoveredCard = null;
              });

              // Shuffle submissions for anonymity
              shuffleArray(lobby.submissions);
              lobby.phase = 'REVEALING_CARDS';
              lobby.revealIndex = 0;
            }

            sendLobbyState(ws.lobbyId);
          }
          break;
        }

        case 'SUBMIT_VOTE': {
          const lobby = lobbies.get(ws.lobbyId);
          if (!lobby) return;
          if (lobby.phase !== 'REVEALING_CARDS') return;

          const rating = parseInt(data.rating);
          if (rating < 1 || rating > 5) return;

          const currentSubmission = lobby.submissions[lobby.revealIndex];
          if (!currentSubmission) return;

          // Record vote
          currentSubmission.ratings[ws.playerId] = rating;

          // Check if everyone in the lobby has voted
          const totalVoters = lobby.players.length;
          const totalVotes = Object.keys(currentSubmission.ratings).length;

          if (totalVotes === totalVoters) {
            // All votes cast for this card
            if (lobby.revealIndex < lobby.submissions.length - 1) {
              lobby.revealIndex++;
            } else {
              // All cards revealed and voted on
              calculateRoundResults(ws.lobbyId);
            }
          }
          sendLobbyState(ws.lobbyId);
          break;
        }

        case 'NEXT_ROUND': {
          const lobby = lobbies.get(ws.lobbyId);
          if (!lobby) return;
          if (lobby.phase !== 'ROUND_RESULTS') return;

          if (lobby.hostId !== ws.playerId) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Only the host can start the next round!' }));
            return;
          }

          const activePlayer = lobby.players[lobby.activePlayerIdx];

          // Every player draws a unique card from the deck EXCEPT for the one who drew the caption
          for (let p of lobby.players) {
            if (p.id !== activePlayer.id) {
              const card = await drawCardFromDeck(lobby);
              p.hand.push(card);
            }
            // Reset hover card for all players for the next round
            p.hoveredCard = null;
          }

          // Rotate active player clockwise
          lobby.activePlayerIdx = (lobby.activePlayerIdx + 1) % lobby.players.length;

          // Reset round state
          lobby.submissions = [];
          lobby.revealIndex = -1;
          lobby.currentCaption = null;
          lobby.captionOptions = [];
          lobby.phase = 'WAITING_FOR_CAPTION';

          sendLobbyState(ws.lobbyId);
          break;
        }

        case 'PLAY_AGAIN': {
          const lobby = lobbies.get(ws.lobbyId);
          if (!lobby) return;
          if (lobby.phase !== 'GAME_OVER') return;

          if (lobby.hostId !== ws.playerId) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Only the host can restart the game!' }));
            return;
          }

          // Reset the deck for the new game
          lobby.deck = null;

          for (let p of lobby.players) {
            p.points = 0;
            p.hand = [];
            p.hoveredCard = null;
            for (let j = 0; j < 5; j++) {
              const card = await drawCardFromDeck(lobby);
              p.hand.push(card);
            }
          }

          lobby.activePlayerIdx = 0;
          lobby.submissions = [];
          lobby.revealIndex = -1;
          lobby.currentCaption = null;
          lobby.captionOptions = [];
          lobby.phase = 'WAITING_FOR_CAPTION';
          lobby.winnerId = null;

          sendLobbyState(ws.lobbyId);
          break;
        }

        case 'HOVER_CARD': {
          const lobby = lobbies.get(ws.lobbyId);
          if (!lobby) return;

          const player = lobby.players.find(p => p.id === ws.playerId);
          if (player) {
            player.hoveredCard = data.cardIndex;
            sendLobbyState(ws.lobbyId);
          }
          break;
        }

        case 'DEBUG_LOG': {
          console.log(`[Client Debug] ${data.message}`);
          break;
        }
      }
    } catch (err) {
      console.error('[WebSocket] Error handling message:', err);
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message format.' }));
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
    const { lobbyId, playerId } = ws;
    if (lobbyId && playerId) {
      const lobby = lobbies.get(lobbyId);
      if (lobby) {
        const player = lobby.players.find(p => p.id === playerId);
        if (player) {
          player.disconnected = true;
          console.log(`[Lobby] Player ${playerId} (${player.name}) disconnected. Grace period started.`);
          
          if (player.disconnectTimeout) clearTimeout(player.disconnectTimeout);
          
          // Wait 15 seconds before removing the player
          player.disconnectTimeout = setTimeout(() => {
            console.log(`[Lobby] Grace period expired for player ${playerId}. Removing player.`);
            handleLeaveLobby(lobbyId, playerId);
          }, 15000);
          return;
        }
      }
      // Fallback if lobby or player not found
      handleLeaveLobby(lobbyId, playerId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log("Ready to proxy to Google Drive once credentials are provided in .env");
});
// Trigger watch reload

