// Хранилище сессий (в реальности лучше использовать Redis)
const sessions = {};

app.get('/api/get-drum', (req, res) => {
    const sessionId = req.session.id;
    const alphabet = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    
    // Перемешиваем буквы
    const shuffled = alphabet.sort(() => Math.random() - 0.5);
    
    // Генерируем случайные одноразовые токены
    const drumMap = {};
    const clientDrum = shuffled.map(char => {
        const token = Math.random().toString(36).substring(2);
        drumMap[token] = char; // Сохраняем реальное значение на сервере
        return { token }; // Отдаем клиенту только токен (букву можно нарисовать на canvas)
    });

    sessions[sessionId] = drumMap; // Обновляем карту в сессии
    res.json({ drum: clientDrum });
});

app.post('/api/submit-click', (req, res) => {
    const sessionId = req.session.id;
    const { token } = req.body;
    
    const currentMap = sessions[sessionId];
    if (!currentMap || !currentMap[token]) {
        return res.status(400).json({ error: "Токен устарел или неверен! Барабан заклинило." });
    }

    const realChar = currentMap[token];
    // Записываем realChar в финальный ввод...
    
    // Сразу сжигаем текущую карту, чтобы curl-повтор не сработал
    delete sessions[sessionId]; 
    
    res.json({ success: true, message: "Символ принят" });
});
