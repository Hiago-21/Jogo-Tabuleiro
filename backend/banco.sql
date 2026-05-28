-- 1. Usuários e Partidas
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE matches (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(10) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'waiting',
    current_turn_player_id INT REFERENCES users(id) ON DELETE SET NULL,
    global_state JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. As Casas do Tabuleiro (Criadas pelos jogadores / padrão do jogo)
CREATE TABLE board_tiles (
    id SERIAL PRIMARY KEY,
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    creator_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,          -- Ex: "Casa 7", "Pântano Venenoso"
    effect_payload JSONB DEFAULT '{}',   -- O que a casa faz (Regra gerada pela LLM)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Conexões entre as Casas (Arestas do Grafo)
CREATE TABLE tile_connections (
    tile_id_1 INT REFERENCES board_tiles(id) ON DELETE CASCADE,
    tile_id_2 INT REFERENCES board_tiles(id) ON DELETE CASCADE,
    PRIMARY KEY (tile_id_1, tile_id_2)
);


-- 4. Jogadores (Usam current_tile_id)
CREATE TABLE match_players (
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    hp INT DEFAULT 10,
    coins INT DEFAULT 5,
    current_tile_id INT REFERENCES board_tiles(id) ON DELETE SET NULL, -- Onde o jogador está
    turn_order INT DEFAULT 0,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (match_id, user_id)
);

-- 5. Entidades (Monstros/Itens também ocupam Casas específicas)
CREATE TABLE entities (
    id SERIAL PRIMARY KEY,
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    owner_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    entity_type VARCHAR(50) NOT NULL,
    current_tile_id INT REFERENCES board_tiles(id) ON DELETE CASCADE, -- Onde a entidade está
    dynamic_attributes JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Regras Dinâmicas Ativas
CREATE TABLE dynamic_rules (
    id SERIAL PRIMARY KEY,
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    creator_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    original_prompt TEXT NOT NULL,
    llm_action_payload JSONB NOT NULL,
    coin_cost INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices otimizados para busca de posicionamento nas casas
CREATE INDEX idx_board_tiles_match ON board_tiles(match_id);
CREATE INDEX idx_match_players_tile ON match_players(current_tile_id);
CREATE INDEX idx_entities_tile ON entities(current_tile_id);