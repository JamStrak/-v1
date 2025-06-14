const DICE_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb'; // Example: Battery Service UUID for wider discoverability initially. Or use a custom one.
const DICE_CHARACTERISTIC_UUID = '00002a19-0000-1000-8000-00805f9b34fb'; // Example: Battery Level characteristic

// For a truly custom service, generate your own UUIDs:
// const DICE_SERVICE_UUID = 'your-custom-service-uuid'; // e.g., '12345678-1234-5678-1234-56789abcdef0'
// const DICE_CHARACTERISTIC_UUID_C2S = 'your-custom-char-client-to-server-uuid'; // Client to Server
// const DICE_CHARACTERISTIC_UUID_S2C = 'your-custom-char-server-to-client-uuid'; // Server to Client (for notifications)
// For simplicity in V1, we'll use one characteristic for bi-directional conceptual flow,
// but real GATT would have different characteristics for client write and server notify.
// This V1 will have the client write to the characteristic, and the host also write to it (which client then reads or is notified of).

let device;
let gattServer;
let diceService;
let diceCharacteristic;

let isHost = false;
let myDiceValues = [0, 0];
let opponentDiceValues = [0, 0];
let myTurn = false;
let gameHistory = []; // Host only

const btnBecomeHost = document.getElementById('btnBecomeHost');
const btnBecomeClient = document.getElementById('btnBecomeClient');
const roleSelectionDiv = document.getElementById('roleSelection');
const gameAreaDiv = document.getElementById('gameArea');
const myRoleSpan = document.getElementById('myRole');
const statusSpan = document.getElementById('status');
const myDiceDivs = Array.from(document.getElementById('myDice').children);
const opponentDiceDivs = Array.from(document.getElementById('opponentDice').children);
const myScoreSpan = document.getElementById('myScore');
const opponentScoreSpan = document.getElementById('opponentScore');
const btnRollDice = document.getElementById('btnRollDice');
const btnRestartGame = document.getElementById('btnRestartGame');
const historyAreaDiv = document.getElementById('historyArea');
const historyListUl = document.getElementById('historyList');
const myPlayerNameSpan = document.getElementById('myPlayerName');
const opponentPlayerNameSpan = document.getElementById('opponentPlayerName');


btnBecomeHost.addEventListener('click', async () => {
    isHost = true;
    myRoleSpan.textContent = '主机';
    myPlayerNameSpan.textContent = '主机';
    opponentPlayerNameSpan.textContent = '客户端';
    roleSelectionDiv.style.display = 'none';
    gameAreaDiv.style.display = 'block';
    historyAreaDiv.style.display = 'block';
    statusSpan.textContent = '等待客户端连接...';
    btnRestartGame.style.display = 'inline-block';

    try {
        // For the host, we don't actively "connect" in the same way.
        // We need to set up the GATT server to be discoverable.
        // However, Web Bluetooth API is client-centric.
        // The "host" device essentially becomes a GATT server when a client requests to connect to its services.
        // So, the host mostly waits.
        console.log('主机模式启动。等待客户端连接...');
        // A more complete host implementation would use navigator.bluetooth.requestDevice with acceptAllDevices: true
        // and then manage the advertisement or act as a GATT server.
        // For this simple P2P, the host will have its GATT server implicitly created/exposed when the client connects.

        // The host needs to be ready to accept connections.
        // The following is conceptual for a host. The actual GATT server setup
        // is implicitly handled when the client connects and requests services IF the OS/browser allows it.
        // This part is tricky with Web Bluetooth for true P2P without a peripheral.
        // Let's assume the client will initiate, and the host's browser will prompt for permission.

        // To allow the client to find *this* device if it's also acting as a GATT server,
        // the browser running the host script might need to be "discoverable" or "advertising".
        // Web Bluetooth doesn't directly provide APIs for a web page to act as a full BLE advertiser.
        // Instead, the OS and browser handle making services available if a client requests them.

        // For now, the host just waits. The client will initiate discovery.
        // The host will define how it handles characteristic writes from the client.

    } catch (error) {
        console.error('主机启动失败:', error);
        statusSpan.textContent = `主机错误: ${error.message}`;
    }
});

btnBecomeClient.addEventListener('click', async () => {
    isHost = false;
    myRoleSpan.textContent = '客户端';
    myPlayerNameSpan.textContent = '客户端';
    opponentPlayerNameSpan.textContent = '主机';
    roleSelectionDiv.style.display = 'none';
    gameAreaDiv.style.display = 'block';
    statusSpan.textContent = '正在搜索主机...';

    try {
        console.log('请求蓝牙设备...');
        device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [DICE_SERVICE_UUID] }],
            // acceptAllDevices: true, // Use this if you don't have a specific service UUID on the host
            // optionalServices: [DICE_SERVICE_UUID] // Important for custom services
        });
        statusSpan.textContent = `已找到设备: ${device.name || '未知设备'}`;
        console.log('设备:', device);

        device.addEventListener('gattserverdisconnected', onDisconnected);

        console.log('连接到GATT服务器...');
        gattServer = await device.gatt.connect();
        statusSpan.textContent = '已连接到GATT服务器';
        console.log('GATT服务器:', gattServer);

        console.log('获取DICE服务...');
        diceService = await gattServer.getPrimaryService(DICE_SERVICE_UUID);
        statusSpan.textContent = '已获取DICE服务';
        console.log('服务:', diceService);

        console.log('获取DICE特征值...');
        diceCharacteristic = await diceService.getCharacteristic(DICE_CHARACTERISTIC_UUID);
        statusSpan.textContent = '已获取DICE特征值. 等待主机开始...';
        console.log('特征值:', diceCharacteristic);

        await diceCharacteristic.startNotifications();
        diceCharacteristic.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
        console.log('已启动通知');

        // Notify host that client is ready
        sendData({ type: 'CLIENT_READY' });
        myTurn = false; // Client waits for host's first move or signal
        btnRollDice.disabled = true;

    } catch (error) {
        console.error('客户端连接失败:', error);
        statusSpan.textContent = `连接错误: ${error.message}`;
        // Show role selection again if connection fails
        roleSelectionDiv.style.display = 'block';
        gameAreaDiv.style.display = 'none';
    }
});

function onDisconnected() {
    statusSpan.textContent = '蓝牙连接已断开';
    console.log('蓝牙连接已断开');
    btnRollDice.disabled = true;
    // Optionally, try to reconnect or reset UI
    roleSelectionDiv.style.display = 'block';
    gameAreaDiv.style.display = 'none';
    if (isHost) historyAreaDiv.style.display = 'none';

    // Reset connection variables
    device = null;
    gattServer = null;
    diceService = null;
    diceCharacteristic = null;
}


btnRollDice.addEventListener('click', () => {
    myDiceValues = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    displayDice('my', myDiceValues);
    btnRollDice.disabled = true;

    const dataToSend = {
        type: isHost ? 'HOST_ROLL' : 'CLIENT_ROLL',
        dice: myDiceValues
    };
    sendData(dataToSend);

    if (isHost) {
        statusSpan.textContent = '等待客户端摇骰子...';
    } else {
        statusSpan.textContent = '等待主机结果...';
    }
});

btnRestartGame.addEventListener('click', () => {
    if (!isHost) return;
    resetDiceDisplay();
    myTurn = true;
    btnRollDice.disabled = false;
    btnRestartGame.style.display = 'none'; // Hide until game ends
    statusSpan.textContent = '新游戏！主机请摇骰子。';
    sendData({ type: 'GAME_RESTART' });
});


function handleCharacteristicValueChanged(event) {
    const value = event.target.value; // This is a DataView
    const decoder = new TextDecoder('utf-8');
    const messageStr = decoder.decode(value);
    try {
        const data = JSON.parse(messageStr);
        console.log('收到数据:', data);

        if (isHost) { // Host processing messages from Client
            if (data.type === 'CLIENT_READY') {
                statusSpan.textContent = '客户端已连接! 主机请摇骰子。';
                myTurn = true;
                btnRollDice.disabled = false;
                btnRestartGame.style.display = 'none';
            } else if (data.type === 'CLIENT_ROLL') {
                opponentDiceValues = data.dice;
                displayDice('opponent', opponentDiceValues);
                determineWinner();
            }
        } else { // Client processing messages from Host
            if (data.type === 'HOST_ROLL') {
                opponentDiceValues = data.dice;
                displayDice('opponent', opponentDiceValues);
                statusSpan.textContent = '轮到你摇骰子了!';
                myTurn = true;
                btnRollDice.disabled = false;
            } else if (data.type === 'GAME_RESULT') {
                statusSpan.textContent = data.message;
                // Client doesn't control restart button, host does
            } else if (data.type === 'GAME_RESTART') {
                resetDiceDisplay();
                statusSpan.textContent = '主机已开始新游戏. 等待主机摇骰子...';
                myTurn = false;
                btnRollDice.disabled = true;
            }
        }
    } catch (error) {
        console.error('解析数据错误:', error, "原始数据:", messageStr);
        statusSpan.textContent = '收到无法解析的数据';
    }
}

async function sendData(dataObj) {
    if (!diceCharacteristic && isHost) {
        // Host scenario: if client disconnects, diceCharacteristic might be null
        // For host to send, it needs the client's characteristic object.
        // This simplistic model assumes client initiates and host gets characteristic.
        // A robust host would need to manage multiple client characteristics.
        // For V1, if host's characteristic is gone, it means client disconnected.
        console.warn('主机：无法发送数据，客户端可能已断开。');
        statusSpan.textContent = '客户端已断开，无法发送数据。';
        onDisconnected(); // Trigger disconnection logic
        return;
    }
    if (!diceCharacteristic) {
        console.error('无法发送数据: 特征值未设置');
        statusSpan.textContent = '错误: 蓝牙通讯未就绪';
        return;
    }

    try {
        const encoder = new TextEncoder('utf-8');
        const data = encoder.encode(JSON.stringify(dataObj));
        // The "host" also writes to the characteristic, and the client listens for notifications.
        // This is a simplification. Ideally, host writes to a "server-to-client" characteristic
        // and client writes to a "client-to-server" characteristic.
        await diceCharacteristic.writeValue(data);
        console.log('数据已发送:', dataObj);
    } catch (error) {
        console.error('发送数据失败:', error);
        statusSpan.textContent = `发送错误: ${error.message}`;
        onDisconnected(); // Assume critical error, trigger disconnect
    }
}

function displayDice(player, diceValues) {
    const diceElements = player === 'my' ? myDiceDivs : opponentDiceDivs;
    const scoreElement = player === 'my' ? myScoreSpan : opponentScoreSpan;
    diceElements.forEach((div, index) => {
        div.textContent = diceValues[index] || '?';
    });
    scoreElement.textContent = diceValues[0] + diceValues[1] || 0;
}

function resetDiceDisplay() {
    myDiceValues = [0,0];
    opponentDiceValues = [0,0];
    displayDice('my', myDiceValues);
    displayDice('opponent', opponentDiceValues);
}

function determineWinner() {
    if (!isHost) return; // Only host determines winner

    const hostScore = myDiceValues[0] + myDiceValues[1];
    const clientScore = opponentDiceValues[0] + opponentDiceValues[1];
    let message = '';

    if (hostScore > clientScore) {
        message = `主机胜! (${hostScore} vs ${clientScore})`;
    } else if (clientScore > hostScore) {
        message = `客户端胜! (${clientScore} vs ${hostScore})`;
    } else {
        message = `平局! (${hostScore} vs ${clientScore})`;
    }
    statusSpan.textContent = message;
    sendData({ type: 'GAME_RESULT', message: message });
    recordHistory(message);
    btnRestartGame.style.display = 'inline-block'; // Show for host
}

function recordHistory(result) {
    if (!isHost) return;
    const timestamp = new Date().toLocaleTimeString();
    gameHistory.push({ timestamp, result });
    renderHistory();
}

function renderHistory() {
    if (!isHost) return;
    historyListUl.innerHTML = '';
    // Show latest first
    for (let i = gameHistory.length - 1; i >= 0; i--) {
        const item = gameHistory[i];
        const li = document.createElement('li');
        li.textContent = `[${item.timestamp}] ${item.result}`;
        historyListUl.appendChild(li);
    }
}

// Initial UI setup
resetDiceDisplay();

// A note for host mode:
// In Web Bluetooth, a web page typically acts as a GATT client.
// For a page to act as a GATT server (host), it's more complex and browser/OS dependent.
// The simplified model here is that the client initiates the connection, and the "host"
// browser, upon client's request for a service/characteristic, will (ideally) make it available
// and allow the host script to interact with it (read writes, send notifications).
// The UUIDs used (Battery Service) are common and might make the "host" device discoverable
// if its OS Bluetooth stack is advertising such standard services.
// For custom services, the setup is more involved and might require OS-level tools or different APIs.
// This V1 prioritizes the client connecting to a "host" that can respond.
