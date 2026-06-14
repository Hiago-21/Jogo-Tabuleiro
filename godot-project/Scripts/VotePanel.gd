extends Control

var current_vote_id = ""

# ATENÇÃO: Como você está testando sozinho e o servidor proíbe o criador de votar,
# vamos fingir que este painel está sendo aberto na tela do "Jogador 2".
var my_user_id = 2 

@onready var rule_label = $Panel/RuleTextLabel
@onready var status_label = $Panel/StatusLabel
@onready var yes_btn = $Panel/YesBtn
@onready var no_btn = $Panel/NoBtn

func _ready():
	yes_btn.pressed.connect(_on_yes_pressed)
	no_btn.pressed.connect(_on_no_pressed)

	NetworkManager.connect("on_vote_finished", Callable(self, "_on_vote_finished"))
	NetworkManager.connect("on_error", Callable(self, "_on_error"))

# A Cena Principal vai chamar essa função injetando os dados do servidor
func setup_vote(data):
	current_vote_id = data["voteId"]
	rule_label.text = '"' + data["ruleText"] + '"'
	status_label.text = "O que você decide?"

func _on_yes_pressed():
	send_vote("yes")

func _on_no_pressed():
	send_vote("no")

func send_vote(choice):
	yes_btn.disabled = true
	no_btn.disabled = true
	status_label.text = "Voto enviado. Computando..."

	NetworkManager.send_message("cast_vote", {
		"voteId": current_vote_id,
		"userId": my_user_id,
		"vote": choice
	})

func _on_vote_finished(data):
	# Garante que estamos processando o resultado da votação certa
	if data["voteId"] == current_vote_id:
		if data["approved"]:
			status_label.text = "VOTAÇÃO ENCERRADA: Regra APROVADA!"
			status_label.add_theme_color_override("font_color", Color.GREEN)
		else:
			status_label.text = "VOTAÇÃO ENCERRADA: Regra REJEITADA!"
			status_label.add_theme_color_override("font_color", Color.RED)
			
		yes_btn.hide()
		no_btn.hide()

		# Espera 3 segundos para o jogador ler o resultado e destrói o painel
		await get_tree().create_timer(3.0).timeout
		queue_free()

func _on_error(msg):
	status_label.text = "Erro: " + msg
	yes_btn.disabled = false
	no_btn.disabled = false
