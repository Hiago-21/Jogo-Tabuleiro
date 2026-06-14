const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

// Inicializa a IA com a chave do seu .env
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function evaluatePlayerRule(ruleText) {
    const systemPrompt = `
    Você é o Mestre de um jogo de tabuleiro em turnos. 
    O jogador propôs a seguinte regra, item ou entidade: "${ruleText}"
    
    Sua função é usar lógica matemática para avaliar o impacto disso no balanceamento do jogo.
    Jogadores começam com 10 HP e 5 Moedas. O deslocamento padrão é 1 casa por rodada.
    
    Regras para avaliação:
    1. Calcule um "coin_cost" (Custo em Moedas) de 1 a 10. Regras fracas/cosméticas custam 1-2. Regras que alteram status ou causam dano custam 3-6. Regras que quebram a mecânica global custam 7-10.
    2. Crie um "action_payload" (JSON estruturado) contendo os parâmetros técnicos dessa regra (ex: dano, cura, alteração de status, alcance no grafo de casas).
    
    VOCÊ DEVE RESPONDER ESTRITAMENTE NESTE FORMATO JSON, SEM NENHUM TEXTO ADICIONAL:
    {
        "coin_cost": 3,
        "action_payload": {
            "type": "damage",
            "value": 2,
            "target": "all_enemies"
        }
    }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: systemPrompt,
            config: {
                // Isso garante que o Node.js receba um JSON perfeito, sem o risco da IA querer conversar
                responseMimeType: "application/json", 
            }
        });

        // Retorna o texto gerado já convertido para um Objeto JavaScript
        return JSON.parse(response.text);
    } catch (error) {
        console.error("Erro na comunicação com o Gemini:", error);
        throw error;
    }
}

module.exports = { evaluatePlayerRule };