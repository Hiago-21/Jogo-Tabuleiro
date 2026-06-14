extends Node2D

var action_panel_scene = preload("res://Cenas/ActionPanel.tscn")
var vote_panel_scene = preload("res://Cenas/VotePanel.tscn") # Prepara a cena de votação

func _ready():
	NetworkManager.send_message("create_room", {})
	
	# Fica escutando para ver se alguma votação começa
	NetworkManager.connect("on_vote_started", Callable(self, "_on_vote_started"))
	
	# Instancia o painel do criador de regras
	var panel_instance = action_panel_scene.instantiate()
	add_child(panel_instance)

# Quando o servidor avisar que a votação começou, criamos a Urna na tela!
func _on_vote_started(data):
	var vote_instance = vote_panel_scene.instantiate()
	add_child(vote_instance)
	vote_instance.setup_vote(data) # Injeta o texto da regra na Urna
