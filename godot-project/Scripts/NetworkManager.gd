extends Node

signal on_rule_priced(data)
signal on_vote_started(data)
signal on_rule_applied(data)
signal on_error(message)
signal on_vote_finished(data)

var socket = WebSocketPeer.new()
var is_connected_to_server = false

func _ready():
	# Conecta ao nosso servidor Node.js
	var err = socket.connect_to_url("ws://localhost:3000")
	if err != OK:
		print("Erro ao tentar iniciar a conexão WebSocket.")

func _process(_delta):
	socket.poll()
	var state = socket.get_ready_state()

	if state == WebSocketPeer.STATE_OPEN:
		if not is_connected_to_server:
			print("Conectado ao Servidor Node.js!")
			is_connected_to_server = true
		
		# Lê todas as mensagens que o Node.js enviar
		while socket.get_available_packet_count() > 0:
			var packet = socket.get_packet()
			var message = packet.get_string_from_utf8()
			handle_server_message(message)
			
	elif state == WebSocketPeer.STATE_CLOSED:
		if is_connected_to_server:
			print("Desconectado do servidor.")
			is_connected_to_server = false

# Função para enviarmos comandos do jogo para o Node.js
func send_message(action: String, data: Dictionary):
	if socket.get_ready_state() == WebSocketPeer.STATE_OPEN:
		var payload = {
			"action": action,
			"data": data
		}
		socket.send_text(JSON.stringify(payload))

# Função que processa o que o servidor respondeu
func handle_server_message(message: String):
	var parsed = JSON.parse_string(message)
	if typeof(parsed) == TYPE_DICTIONARY and parsed.has("action"):
		match parsed["action"]:
			"rule_priced":
				emit_signal("on_rule_priced", parsed["data"])
			"vote_started":
				emit_signal("on_vote_started", parsed["data"])
			"rule_applied":
				emit_signal("on_rule_applied", parsed["data"])
			"error":
				emit_signal("on_error", parsed["data"]["message"])
			"vote_finished":
				emit_signal("on_vote_finished", parsed["data"])
			_:
				print("Ação desconhecida: ", parsed["action"])
