const connectBtn = document.getElementById('connect');
const tempDisplay = document.getElementById('temp');
const humDisplay = document.getElementById('hum');
const batteryDisplay = document.getElementById('battery');

// --- НАСТРОЙКИ MQTT ---
// Придумайте свой уникальный ID, чтобы никто другой не читал ваши данные!
const TOPIC_NAME = "my_atc_sensor/unique_id_99"; 
const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt');

let lastData = { t: "--.-", h: "--.-", b: "--" };

client.on('connect', () => {
    console.log('Подключено к MQTT брокеру');
    client.subscribe(TOPIC_NAME); // Подписываемся, чтобы видеть данные на другом устройстве
});

// Слушаем данные из облака (для удаленного мониторинга)
client.on('message', (topic, message) => {
    const data = JSON.parse(message.toString());
    updateUI(data.t, data.h, data.b, true);
});

// Функция обновления интерфейса и отправки в облако
function updateUI(temp, hum, batt, isRemote = false) {
    if (temp !== undefined) tempDisplay.innerText = temp + " °C";
    if (hum !== undefined) humDisplay.innerText = hum + " %";
    if (batt !== undefined) {
        batteryDisplay.innerText = batt + " %";
        batteryDisplay.style.color = batt > 50 ? "#2ecc71" : (batt > 20 ? "#f1c40f" : "#e74c3c");
    }

    // Если данные пришли по Bluetooth (не удаленно), отправляем их в облако
    if (!isRemote) {
        client.publish(TOPIC_NAME, JSON.stringify({ t: temp, h: hum, b: batt }));
    } else {
        connectBtn.innerText = "ОБНОВЛЕНО ИЗ ОБЛАКА";
        connectBtn.style.background = "#3498db";
    }
}

// --- Bluetooth Логика ---
connectBtn.addEventListener('click', async () => {
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'ATC' }, { namePrefix: 'LYWSD03' }],
            optionalServices: [0x181a, 0x180f]
        });

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(0x181a);

        // Температура
        const tempChar = await service.getCharacteristic(0x2a6e);
        await tempChar.startNotifications();
        tempChar.addEventListener('characteristicvaluechanged', (e) => {
            const val = (e.target.value.getInt16(0, true) / 100).toFixed(1);
            lastData.t = val;
            updateUI(lastData.t, lastData.h, lastData.b);
        });

        // Влажность
        try {
            const humChar = await service.getCharacteristic(0x2a6f);
            await humChar.startNotifications();
            humChar.addEventListener('characteristicvaluechanged', (e) => {
                const val = (e.target.value.getUint16(0, true) / 100).toFixed(1);
                lastData.h = val;
                updateUI(lastData.t, lastData.h, lastData.b);
            });
        } catch (e) { console.log("Влажность недоступна"); }

        // Батарея
        try {
            const bService = await server.getPrimaryService(0x180f);
            const bChar = await bService.getCharacteristic(0x2a19);
            const bVal = await bChar.readValue();
            lastData.b = bVal.getUint8(0);
            updateUI(lastData.t, lastData.h, lastData.b);
        } catch (e) { console.log("Батарея недоступна"); }

        connectBtn.innerText = "ТРАНСЛЯЦИЯ ВКЛЮЧЕНА";
        connectBtn.style.background = "#2ecc71";

    } catch (err) {
        alert("Ошибка: " + err.message);
    }
});
