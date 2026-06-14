extends Control

# IDs mockados para o nosso teste (no jogo real, virão da sessão do jogador)
var my_match_id = 1
var my_user_id = 1
var current_pending_id = ""

@onready var rule_input = $Panel/RuleInput
@onready var status_label = $Panel/StatusLabel
@onready var submit_btn = $Panel/SubmitBtn
@onready var buy_btn = $Panel/BuyBtn
@onready var vote_btn = $Panel/GoToVoteBtn

func _ready():
	# Conecta os sinais do NetworkManager a este painel
	NetworkManager.connect("on_rule_priced", Callable(self, "_on_rule_priced"))
	NetworkManager.connect("on_rule_applied", Callable(self, "_on_rule_applied"))
	NetworkManager.connect("on_error", Callable(self, "_on_error"))
	
	# Conecta os botões da interface
	submit_btn.pressed.connect(_on_submit_pressed)
	buy_btn.pressed.connect(_on_buy_pressed)
	vote_btn.pressed.connect(_on_vote_pressed)

func _on_submit_pressed():
	if rule_input.text.strip_edges() == "":
		return
		
	status_label.text = "A IA está avaliando o custo..."
	submit_btn.disabled = true
	
	# Manda pro Node.js avaliar
	NetworkManager.send_message("submit_rule", {
		"matchId": my_match_id, 
		"userId": my_user_id,
		"ruleText": rule_input.text
	})

# --- RECEBENDO AS RESPOSTAS DO SERVIDOR ---

func _on_rule_priced(data):
	current_pending_id = data["pendingId"]
	
	# ADICIONE ESTAS DUAS LINHAS PARA DEPURAR:
	print("O SERVIDOR MANDOU O ID: ", data["pendingId"])
	print("A GODOT SALVOU O ID: ", current_pending_id)
	
	var cost = data["cost"]
	var coins = data["playerCoins"]
	var can_afford = data["canAfford"]
	
	status_label.text = "Custo: %d moedas. Você tem: %d." % [cost, coins]
	
	rule_input.hide()
	submit_btn.hide()
	
	buy_btn.show()
	vote_btn.show()
	buy_btn.disabled = !can_afford
	
func _on_buy_pressed():
	NetworkManager.send_message("decide_rule", {
		"pendingId": current_pending_id,
		"decision": "buy"
	})

func _on_vote_pressed():
	NetworkManager.send_message("decide_rule", {
		"pendingId": current_pending_id,
		"decision": "vote"
	})

func _on_rule_applied(data):
	status_label.text = "SUCESSO! Regra aplicada na mesa."
	buy_btn.hide()
	vote_btn.hide()
	
	# Fecha o painel depois de 2 segundos (opcional)
	await get_tree().create_timer(2.0).timeout
	queue_free() # Destrói a instância!

func _on_error(msg):
	status_label.text = "Erro: " + msg
	submit_btn.disabled = false
