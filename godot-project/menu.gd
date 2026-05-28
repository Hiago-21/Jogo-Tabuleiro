extends Control

func _ready():
	NetworkManager.send_message("create_room", {})
	
	# Espera 2 segundos e envia uma regra maluca para a IA avaliar
	await get_tree().create_timer(2.0).timeout
	
	var teste_regra = "Eu quero invocar um Dragão de Fogo na minha casa atual que causa 3 de dano em quem pisar nela."
	
	# ATENÇÃO: Em um jogo real, os IDs viriam da tela de join. Aqui estamos mockando como ID 1 para teste rápido.
	NetworkManager.send_message("submit_rule", {
		"matchId": 1, 
		"userId": 1,
		"ruleText": teste_regra
	})
