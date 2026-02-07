// IBONARIUM · PLANETARY BIOSPHERE ENGINE
// 3D Spiral Time Visualization

const MAX_POINTS = 7 * 24 * 6; // 7 days * 24 hours * 6 points/hour

const STATE = {
    history: [],
    micro: { soilT: 0, soilM: 0, oceanT: 0, microbeActivity: 0, soc: 1500, score: 0 },
    flora: { ndvi: 0, npp: 56.4, co2: 0, et: 0, forestArea: 40, score: 0 },
    luna: { phase: "", illumination: 0, tide: 0, score: 0 },
    chrono: { circadian: 0, dayLength: 12 },
    eco: { species: 2.16, endangered: 44, deforestation: 10, events: 0, score: 0 },
    globalIdx: 0,
    cam: { rot: 0, pitch: 0.4 }
};

const elLogs = document.getElementById('sys-log');
const elClock = document.getElementById('clock-main');
const canSpiral = document.getElementById('spiral-3d');
const ctxSpy = canSpiral.getContext('2d');

// ============================================================================
// INIT & LOOP
// ============================================================================

async function init() {
    mockHistory();
    renderLayersInit();
    initNodes(); // Initialize network animation

    setInterval(tickClock, 1000);
    setInterval(fetchPedosphereData, 300000); // 5 min
    setInterval(fetchVegetationData, 600000); // 10 min
    setInterval(fetchBiodiversityData, 900000); // 15 min
    setInterval(fetchLunarData, 60000); // 1 min
    setInterval(checkDataUpdates, 100); // Check for visual updates

    requestAnimationFrame(animLoop);

    await Promise.all([
        fetchPedosphereData(),
        fetchVegetationData(),
        fetchBiodiversityData(),
        fetchLunarData()
    ]);

    log("IBONARIUM PLANETARY BIOSPHERE ENGINE: ОНЛАЙН");
    log("Підключення до глобальних біосферних сенсорів...");
}

function mockHistory() {
    const now = Date.now();
    const interval = 10 * 60 * 1000; // 10 mins

    for (let i = MAX_POINTS; i > 0; i--) {
        const t = now - (i * interval);
        const date = new Date(t);
        const hrs = date.getHours();

        let base = 60 + Math.sin((hrs / 24) * Math.PI * 2) * 15;
        let noise = (Math.random() - 0.5) * 10;
        if (Math.random() > 0.98) noise -= 20;

        let val = Math.max(0, Math.min(100, base + noise));

        let r = 0, g = 255, b = 200;
        if (val < 40) { r = 255; g = 0; b = 100; }
        else if (val < 60) { r = 255; g = 180; b = 0; }

        STATE.history.push({
            t: t,
            val: val,
            c: `rgb(${r},${g},${b})`
        });
    }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchPedosphereData() {
    document.getElementById('micro-status').innerText = 'SYNC';
    try {
        const locations = [
            { lat: 50.45, lon: 30.52 },
            { lat: -23.55, lon: -46.63 },
            { lat: 35.68, lon: 139.65 },
            { lat: 40.71, lon: -74.00 },
            { lat: -33.87, lon: 151.21 }
        ];

        let totalSoilT = 0, totalSoilM = 0, totalOceanT = 0;

        for (const loc of locations) {
            const res = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=soil_temperature_0cm,soil_moisture_0_to_1cm,temperature_2m&timezone=auto`
            );
            const data = await res.json();

            totalSoilT += data.current.soil_temperature_0cm || 15;
            totalSoilM += data.current.soil_moisture_0_to_1cm || 0.25;
            totalOceanT += data.current.temperature_2m || 15;
        }

        STATE.micro.soilT = totalSoilT / locations.length;
        STATE.micro.soilM = totalSoilM / locations.length;
        STATE.micro.oceanT = totalOceanT / locations.length;

        const tEff = Math.max(0, 100 - (Math.abs(STATE.micro.soilT - 22) * 3.5));
        const mEff = Math.max(0, 100 - (Math.abs(STATE.micro.soilM - 0.30) * 180));
        const oceanEff = Math.max(0, 100 - (Math.abs(STATE.micro.oceanT - 17) * 4));

        STATE.micro.microbeActivity = (tEff * 0.4 + mEff * 0.35 + oceanEff * 0.25);
        STATE.micro.soc = 1500 + Math.sin(Date.now() / 10000000) * 50;

        STATE.micro.score = (tEff * 0.3) + (mEff * 0.3) + (STATE.micro.microbeActivity * 0.4);

        updateUI();
        log(`ПЕДОСФЕРА: T=${STATE.micro.soilT.toFixed(1)}°C | M=${STATE.micro.soilM.toFixed(3)} | Активність=${STATE.micro.microbeActivity.toFixed(0)}%`);
        document.getElementById('micro-status').innerText = 'LIVE';
    } catch (e) {
        console.error('Pedosphere fetch error:', e);
        document.getElementById('micro-status').innerText = 'ERR';
    }
}

async function fetchVegetationData() {
    document.getElementById('flora-status').innerText = 'SYNC';
    try {
        const co2Res = await fetch('https://global-warming.org/api/co2-api');
        const co2Data = await co2Res.json();
        if (co2Data.co2 && co2Data.co2.length > 0) {
            STATE.flora.co2 = parseFloat(co2Data.co2[co2Data.co2.length - 1].trend);
        }

        const locations = [
            { lat: 0, lon: 0 },
            { lat: 45, lon: 0 },
            { lat: -30, lon: 0 }
        ];

        let totalET = 0;
        for (const loc of locations) {
            const res = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=evapotranspiration&timezone=auto`
            );
            const data = await res.json();
            totalET += data.current.evapotranspiration || 2.5;
        }
        STATE.flora.et = totalET / locations.length;

        const month = new Date().getMonth();
        const seasonalFactor = 0.5 + 0.3 * Math.sin((month / 12) * Math.PI * 2);
        const co2Factor = Math.max(0, 1 - (STATE.flora.co2 - 280) / 400);
        STATE.flora.ndvi = (seasonalFactor * 0.6 + co2Factor * 0.4) * 0.85;

        const nppBase = 56.4;
        STATE.flora.npp = nppBase * (0.8 + STATE.flora.ndvi * 0.4) * (1 - (STATE.flora.co2 - 280) / 1000);

        STATE.flora.forestArea = 40 - (Date.now() - new Date('2024-01-01').getTime()) / (1000 * 60 * 60 * 24 * 365) * 0.1;

        const ndviScore = STATE.flora.ndvi * 100;
        const co2Score = Math.max(0, 100 - (STATE.flora.co2 - 280) / 2);
        const forestScore = (STATE.flora.forestArea / 40) * 100;

        STATE.flora.score = ndviScore * 0.35 + co2Score * 0.30 + forestScore * 0.35;

        updateUI();
        log(`ВЕГЕТАЦІЯ: NDVI=${STATE.flora.ndvi.toFixed(3)} | CO₂=${STATE.flora.co2.toFixed(1)}ppm | NPP=${STATE.flora.npp.toFixed(1)}Pg/yr`);
        document.getElementById('flora-status').innerText = 'LIVE';
    } catch (e) {
        console.error('Vegetation fetch error:', e);
        document.getElementById('flora-status').innerText = 'ERR';
    }
}

async function fetchBiodiversityData() {
    document.getElementById('eco-status').innerText = 'SYNC';
    try {
        const gbifRes = await fetch('https://api.gbif.org/v1/occurrence/count');
        const gbifCount = await gbifRes.json();
        STATE.eco.species = (gbifCount / 1000000).toFixed(2);

        try {
            const newsRes = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://news.google.com/rss/search?q=biodiversity+ecosystem+wildlife+conservation');
            const newsData = await newsRes.json();
            STATE.eco.events = newsData.items ? newsData.items.length : 0;
        } catch (e) {
            STATE.eco.events = Math.floor(Math.random() * 15) + 5;
        }

        STATE.eco.endangered = 44 + Math.sin(Date.now() / 100000000) * 2;
        STATE.eco.deforestation = 10 + Math.random() * 2;

        const speciesScore = Math.min(100, (STATE.eco.species / 3) * 100);
        const endangeredScore = Math.max(0, 100 - (STATE.eco.endangered / 50) * 100);
        const deforestScore = Math.max(0, 100 - (STATE.eco.deforestation / 15) * 100);

        STATE.eco.score = speciesScore * 0.30 + endangeredScore * 0.35 + deforestScore * 0.35;

        updateUI();
        log(`БІОРІЗНОМАНІТТЯ: ${STATE.eco.species}М видів | ${STATE.eco.endangered.toFixed(0)}К під загрозою`);
        document.getElementById('eco-status').innerText = 'LIVE';
    } catch (e) {
        console.error('Biodiversity fetch error:', e);
        document.getElementById('eco-status').innerText = 'ERR';
    }
}

async function fetchLunarData() {
    try {
        const now = new Date();
        const lp = calculateLunarPhase(now);
        STATE.luna.illumination = lp.illum;
        STATE.luna.phase = lp.name;

        const tidePhase = (now.getTime() / (1000 * 60 * 60 * 12.42)) * Math.PI * 2;
        STATE.luna.tide = Math.abs(Math.sin(tidePhase));

        STATE.luna.score = 40 + (STATE.luna.tide * 40) + (lp.illum * 20);

        STATE.chrono.dayLength = 12 + Math.sin((new Date().getMonth() / 12) * Math.PI * 2) * 2;

        updateUI();
    } catch (e) {
        console.error('Lunar fetch error:', e);
    }
}

function calculateLunarPhase(date) {
    const LUNAR = 29.530588853;
    const diff = date.getTime() - new Date('2000-01-06T18:14:00Z').getTime();
    const phase = (diff / (1000 * 60 * 60 * 24)) % LUNAR;
    const illum = Math.abs(Math.sin((phase / LUNAR) * Math.PI));

    let name = "Ростучий";
    if (phase < 1.84) name = "Молодик";
    else if (phase < 14.7) name = "Перша чверть";
    else if (phase < 16.6) name = "Повня";
    else name = "Спадний";

    return { illum, name };
}

// ============================================================================
// UI UPDATE
// ============================================================================

function updateUI() {
    document.getElementById('val-soil-t').innerText = STATE.micro.soilT.toFixed(1);
    document.getElementById('val-soil-m').innerText = STATE.micro.soilM.toFixed(3);
    document.getElementById('val-ocean-t').innerText = STATE.micro.oceanT.toFixed(1);
    document.getElementById('val-microbe').innerText = STATE.micro.microbeActivity.toFixed(1);
    document.getElementById('val-soc').innerText = STATE.micro.soc.toFixed(0);

    document.getElementById('val-ndvi').innerText = STATE.flora.ndvi.toFixed(3);
    document.getElementById('val-npp').innerText = STATE.flora.npp.toFixed(1);
    document.getElementById('val-co2').innerText = STATE.flora.co2.toFixed(1);
    document.getElementById('val-et').innerText = STATE.flora.et.toFixed(2);
    document.getElementById('val-forest').innerText = STATE.flora.forestArea.toFixed(1);

    document.getElementById('val-luna-phase').innerText = STATE.luna.phase;
    document.getElementById('val-tide').innerText = (STATE.luna.tide * 100).toFixed(0);
    document.getElementById('val-daylen').innerText = STATE.chrono.dayLength.toFixed(1);

    document.getElementById('val-species').innerText = STATE.eco.species;
    document.getElementById('val-endangered').innerText = STATE.eco.endangered.toFixed(0);
    document.getElementById('val-deforest').innerText = STATE.eco.deforestation.toFixed(1);
    document.getElementById('val-events').innerText = STATE.eco.events;

    const hr = new Date().getHours() + new Date().getMinutes() / 60;
    const circadian = Math.sin((hr / 24) * Math.PI * 2);
    STATE.chrono.circadian = circadian;

    STATE.globalIdx = (
        STATE.micro.score * 0.25 +
        STATE.flora.score * 0.25 +
        STATE.luna.score * 0.15 +
        STATE.eco.score * 0.25 +
        (50 + circadian * 50) * 0.10
    );

    document.getElementById('main-idx').innerText = STATE.globalIdx.toFixed(0);

    const now = Date.now();
    let r = 0, g = 255, b = 200;
    if (STATE.globalIdx < 45) { r = 255; g = 0; b = 50; }
    else if (STATE.globalIdx < 70) { r = 255; g = 160; b = 0; }
    else { r = 50; g = 255; b = 150; }

    STATE.history.push({ t: now, val: STATE.globalIdx, c: `rgb(${r},${g},${b})` });
    if (STATE.history.length > MAX_POINTS) STATE.history.shift();

    updateStatus();
    updateLayers();
}

function updateStatus() {
    const idx = STATE.globalIdx;
    let mood = "";
    let desc = "";

    if (idx > 80) {
        mood = "ПЛАНЕТАРНИЙ РЕЗОНАНС";
        desc = `Біосфера в оптимальному стані. Всі системи синхронізовані. Гомеостаз стабільний.`;
    } else if (idx > 60) {
        mood = "СТАБІЛЬНИЙ ГОМЕОСТАЗ";
        desc = `Базові параметри в нормі. Локальні флуктуації в межах допустимого. Моніторинг триває.`;
    } else if (idx > 40) {
        mood = "БІОСФЕРНА НАПРУГА";
        desc = `Виявлено екологічне тертя. Зростання ентропії. Необхідний аналіз антропогенного впливу.`;
    } else {
        mood = "КРИТИЧНА ДИСОРГАНІЗАЦІЯ";
        desc = `Системний дисбаланс біосфери. Загроза каскадної деградації. Термінові заходи необхідні.`;
    }

    document.getElementById('main-desc').innerHTML = `<span style="color:#fff; font-weight:bold">${mood}</span> // ${desc}`;
    document.getElementById('main-idx').style.color = idx > 60 ? '#fff' : '#f04';

    document.getElementById('calc-bar').style.width = (idx % 100) + '%';
}

function updateLayers() {
    const layers = [
        { id: 'micro', name: 'ПЕДОСФЕРА', score: STATE.micro.score },
        { id: 'flora', name: 'ВЕГЕТАЦІЯ', score: STATE.flora.score },
        { id: 'luna', name: 'МІСЯЧНИЙ ЦИКЛ', score: STATE.luna.score },
        { id: 'eco', name: 'БІОРІЗНОМАНІТТЯ', score: STATE.eco.score }
    ];

    layers.forEach(l => {
        const elVal = document.getElementById(`lval-${l.id}`);
        const elT = document.getElementById(`lt-${l.id}`);

        if (elVal) {
            elVal.innerText = l.score.toFixed(0);
            let color = l.score < 40 ? "#f04" : l.score < 65 ? "#fa0" : "#0fa";
            elVal.style.color = color;
            let statusTxt = l.score < 35 ? "ДЕГРАДАЦІЯ" : l.score < 60 ? "НАПРУГА" : "БАЛАНС";
            if (elT) { elT.innerText = statusTxt; elT.style.color = color; }
        }
    });
}

function renderLayersInit() {
    const list = document.getElementById('layers-list');
    const layers = [
        { id: 'micro', name: 'ПЕДОСФЕРА' },
        { id: 'flora', name: 'ВЕГЕТАЦІЯ' },
        { id: 'luna', name: 'МІСЯЧНИЙ ЦИКЛ' },
        { id: 'eco', name: 'БІОРІЗНОМАНІТТЯ' }
    ];

    list.innerHTML = layers.map(l => `
        <div class="layer-item">
            <div class="layer-head"><span>${l.name}</span> <span id="lt-${l.id}" style="font-weight:bold;">CALC</span></div>
            <div style="display:flex; justify-content:space-between; align-items:flex-end">
                <div class="layer-score" id="lval-${l.id}">--</div>
                <div class="layer-det">IDX</div>
            </div>
        </div>
    `).join('');
}

// ============================================================================
// DYNAMIC BIOSPHERE NETWORK VISUALIZATION
// ============================================================================

// Animation state
const ANIM = {
    time: 0,
    particles: [],
    nodes: [],
    pulses: [],
    dataFlashes: []
};

// Initialize network nodes
function initNodes() {
    ANIM.nodes = [
        { id: 'micro', x: 0.3, y: 0.7, label: 'ПЕДОСФЕРА', color: '#0fa', getData: () => STATE.micro.score },
        { id: 'flora', x: 0.7, y: 0.7, label: 'ВЕГЕТАЦІЯ', color: '#0ff', getData: () => STATE.flora.score },
        { id: 'luna', x: 0.3, y: 0.3, label: 'МІСЯЦЬ', color: '#e1e1e1', getData: () => STATE.luna.score },
        { id: 'eco', x: 0.7, y: 0.3, label: 'БІОРІЗНОМАНІТТЯ', color: '#f0f', getData: () => STATE.eco.score },
        { id: 'core', x: 0.5, y: 0.5, label: 'ЯДРО', color: '#80f', getData: () => STATE.globalIdx }
    ];

    // Create initial particles
    for (let i = 0; i < 50; i++) {
        createParticle();
    }
}

function createParticle() {
    const fromNode = ANIM.nodes[Math.floor(Math.random() * (ANIM.nodes.length - 1))];
    const toNode = ANIM.nodes[Math.floor(Math.random() * ANIM.nodes.length)];

    ANIM.particles.push({
        fromId: fromNode.id,
        toId: toNode.id,
        progress: Math.random(),
        speed: 0.002 + Math.random() * 0.003,
        size: 1 + Math.random() * 2,
        color: fromNode.color,
        life: 1
    });
}

function createPulse(nodeId) {
    const node = ANIM.nodes.find(n => n.id === nodeId);
    if (node) {
        ANIM.pulses.push({
            nodeId: nodeId,
            radius: 0,
            maxRadius: 80,
            alpha: 1,
            color: node.color
        });
    }
}

function createDataFlash(nodeId) {
    const node = ANIM.nodes.find(n => n.id === nodeId);
    if (node) {
        ANIM.dataFlashes.push({
            nodeId: nodeId,
            alpha: 1,
            size: 30
        });
    }
}

function animLoop() {
    ANIM.time += 0.016;
    drawBiosphereNetwork();
    requestAnimationFrame(animLoop);
}

function drawBiosphereNetwork() {
    const w = canSpiral.clientWidth;
    const h = canSpiral.clientHeight;
    if (canSpiral.width !== w) { canSpiral.width = w; canSpiral.height = h; }

    ctxSpy.clearRect(0, 0, w, h);

    // Convert node positions to screen coordinates
    const screenNodes = ANIM.nodes.map(n => ({
        ...n,
        sx: w * n.x,
        sy: h * n.y,
        value: n.getData(),
        pulse: Math.sin(ANIM.time * 2 + n.x * 10) * 0.3 + 0.7
    }));

    // 1. DRAW CONNECTIONS (Background layer)
    ctxSpy.globalAlpha = 0.15;
    screenNodes.forEach((n1, i) => {
        screenNodes.forEach((n2, j) => {
            if (i < j && n1.id !== 'core' && n2.id !== 'core') {
                const dist = Math.hypot(n2.sx - n1.sx, n2.sy - n1.sy);
                const strength = Math.max(0, 1 - dist / 300);

                if (strength > 0) {
                    ctxSpy.strokeStyle = n1.color;
                    ctxSpy.lineWidth = 1 + strength * 2;
                    ctxSpy.beginPath();
                    ctxSpy.moveTo(n1.sx, n1.sy);
                    ctxSpy.lineTo(n2.sx, n2.sy);
                    ctxSpy.stroke();
                }
            }
        });
    });
    ctxSpy.globalAlpha = 1;

    // Core connections (always visible)
    const coreNode = screenNodes.find(n => n.id === 'core');
    screenNodes.forEach(n => {
        if (n.id !== 'core') {
            const flowIntensity = (n.value / 100) * 0.5 + 0.3;
            ctxSpy.strokeStyle = n.color;
            ctxSpy.lineWidth = 2;
            ctxSpy.globalAlpha = flowIntensity;
            ctxSpy.beginPath();
            ctxSpy.moveTo(coreNode.sx, coreNode.sy);
            ctxSpy.lineTo(n.sx, n.sy);
            ctxSpy.stroke();
            ctxSpy.globalAlpha = 1;
        }
    });

    // 2. DRAW PULSES (Expanding rings on data update)
    ANIM.pulses = ANIM.pulses.filter(pulse => {
        const node = screenNodes.find(n => n.id === pulse.nodeId);
        if (!node) return false;

        pulse.radius += 2;
        pulse.alpha -= 0.02;

        if (pulse.alpha > 0) {
            ctxSpy.strokeStyle = pulse.color;
            ctxSpy.lineWidth = 2;
            ctxSpy.globalAlpha = pulse.alpha;
            ctxSpy.beginPath();
            ctxSpy.arc(node.sx, node.sy, pulse.radius, 0, Math.PI * 2);
            ctxSpy.stroke();
            ctxSpy.globalAlpha = 1;
            return true;
        }
        return false;
    });

    // 3. DRAW DATA FLASHES (Bright flash on update)
    ANIM.dataFlashes = ANIM.dataFlashes.filter(flash => {
        const node = screenNodes.find(n => n.id === flash.nodeId);
        if (!node) return false;

        flash.alpha -= 0.05;
        flash.size += 2;

        if (flash.alpha > 0) {
            ctxSpy.shadowBlur = 20;
            ctxSpy.shadowColor = node.color;
            ctxSpy.fillStyle = node.color;
            ctxSpy.globalAlpha = flash.alpha;
            ctxSpy.beginPath();
            ctxSpy.arc(node.sx, node.sy, flash.size, 0, Math.PI * 2);
            ctxSpy.fill();
            ctxSpy.shadowBlur = 0;
            ctxSpy.globalAlpha = 1;
            return true;
        }
        return false;
    });

    // 4. DRAW PARTICLES (Data flow)
    ANIM.particles = ANIM.particles.filter(p => {
        const fromNode = screenNodes.find(n => n.id === p.fromId);
        const toNode = screenNodes.find(n => n.id === p.toId);

        if (!fromNode || !toNode) return false;

        p.progress += p.speed;

        if (p.progress >= 1) {
            // Particle reached destination - create new one
            createParticle();
            return false;
        }

        // Interpolate position
        const x = fromNode.sx + (toNode.sx - fromNode.sx) * p.progress;
        const y = fromNode.sy + (toNode.sy - fromNode.sy) * p.progress;

        // Draw particle
        ctxSpy.shadowBlur = 8;
        ctxSpy.shadowColor = p.color;
        ctxSpy.fillStyle = p.color;
        ctxSpy.globalAlpha = p.life * (1 - p.progress * 0.5);
        ctxSpy.beginPath();
        ctxSpy.arc(x, y, p.size, 0, Math.PI * 2);
        ctxSpy.fill();
        ctxSpy.shadowBlur = 0;
        ctxSpy.globalAlpha = 1;

        return true;
    });

    // 5. DRAW NODES (Main layer spheres)
    screenNodes.forEach(n => {
        const health = n.value / 100;
        const nodeColor = health < 0.4 ? '#f04' : health < 0.65 ? '#fa0' : n.color;
        const baseSize = n.id === 'core' ? 25 : 18;
        const size = baseSize * (0.9 + n.pulse * 0.2);

        // Outer glow
        ctxSpy.shadowBlur = 25;
        ctxSpy.shadowColor = nodeColor;

        // Node circle
        ctxSpy.fillStyle = nodeColor;
        ctxSpy.globalAlpha = 0.8;
        ctxSpy.beginPath();
        ctxSpy.arc(n.sx, n.sy, size, 0, Math.PI * 2);
        ctxSpy.fill();

        // Inner core
        ctxSpy.fillStyle = '#fff';
        ctxSpy.globalAlpha = 0.6;
        ctxSpy.beginPath();
        ctxSpy.arc(n.sx, n.sy, size * 0.4, 0, Math.PI * 2);
        ctxSpy.fill();

        ctxSpy.shadowBlur = 0;
        ctxSpy.globalAlpha = 1;

        // Value text
        if (n.id !== 'core') {
            ctxSpy.fillStyle = '#fff';
            ctxSpy.font = '10px Space Mono';
            ctxSpy.textAlign = 'center';
            ctxSpy.textBaseline = 'middle';
            ctxSpy.fillText(n.value.toFixed(0), n.sx, n.sy);
        }

        // Label
        ctxSpy.fillStyle = nodeColor;
        ctxSpy.font = '9px Space Mono';
        ctxSpy.textAlign = 'center';
        ctxSpy.fillText(n.label, n.sx, n.sy + size + 15);
    });

    // 6. DRAW HISTORY GRAPH (Bottom overlay)
    drawHistoryMiniGraph(w, h);
}

function drawHistoryMiniGraph(w, h) {
    const graphH = 60;
    const graphY = h - graphH - 10;
    const graphW = Math.min(300, w - 40);
    const graphX = w - graphW - 20;

    // Background
    ctxSpy.fillStyle = 'rgba(5, 5, 10, 0.7)';
    ctxSpy.fillRect(graphX, graphY, graphW, graphH);

    // Border
    ctxSpy.strokeStyle = 'rgba(100, 100, 255, 0.3)';
    ctxSpy.lineWidth = 1;
    ctxSpy.strokeRect(graphX, graphY, graphW, graphH);

    // Data line
    if (STATE.history.length > 1) {
        const recent = STATE.history.slice(-100);
        const step = graphW / (recent.length - 1);

        ctxSpy.strokeStyle = '#80f';
        ctxSpy.lineWidth = 2;
        ctxSpy.beginPath();

        recent.forEach((pt, i) => {
            const x = graphX + i * step;
            const y = graphY + graphH - (pt.val / 100) * graphH;
            if (i === 0) ctxSpy.moveTo(x, y);
            else ctxSpy.lineTo(x, y);
        });

        ctxSpy.stroke();

        // Fill
        ctxSpy.lineTo(graphX + graphW, graphY + graphH);
        ctxSpy.lineTo(graphX, graphY + graphH);
        ctxSpy.closePath();

        const grad = ctxSpy.createLinearGradient(0, graphY, 0, graphY + graphH);
        grad.addColorStop(0, 'rgba(136, 0, 255, 0.3)');
        grad.addColorStop(1, 'rgba(136, 0, 255, 0)');
        ctxSpy.fillStyle = grad;
        ctxSpy.fill();
    }

    // Label
    ctxSpy.fillStyle = '#88a';
    ctxSpy.font = '8px Space Mono';
    ctxSpy.textAlign = 'left';
    ctxSpy.fillText('7D HISTORY', graphX + 5, graphY + 10);
}

// Trigger visual effects on data updates
let lastUpdateValues = { micro: 0, flora: 0, luna: 0, eco: 0 };

function checkDataUpdates() {
    const nodes = ['micro', 'flora', 'luna', 'eco'];
    nodes.forEach(nodeId => {
        const currentValue = STATE[nodeId].score;
        if (Math.abs(currentValue - lastUpdateValues[nodeId]) > 0.5) {
            createPulse(nodeId);
            if (Math.abs(currentValue - lastUpdateValues[nodeId]) > 5) {
                createDataFlash(nodeId);
            }
            lastUpdateValues[nodeId] = currentValue;
        }
    });
}

// ============================================================================
// UTILITIES
// ============================================================================

function tickClock() {
    const now = new Date();
    elClock.innerText = now.toLocaleTimeString('uk-UA');
}

function log(msg) {
    const t = new Date().toLocaleTimeString('uk-UA', { hour12: false });
    const d = document.createElement('div');
    d.className = 'log-entry';
    d.innerHTML = `<span class="log-time">[${t}]</span> ${msg}`;
    elLogs.prepend(d);
    if (elLogs.children.length > 20) elLogs.lastChild.remove();
}

// START
init();
