package com.itsa.crm.clients_service.controller;

import com.itsa.crm.clients_service.dto.ClientCreateRequest;
import com.itsa.crm.clients_service.dto.ClientDeleteRequest;
import com.itsa.crm.clients_service.dto.ClientDto;
import com.itsa.crm.clients_service.dto.ClientUpdateRequest;
import com.itsa.crm.clients_service.service.ClientService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/clients")
public class ClientController {
	private final ClientService clientService;

	public ClientController(ClientService clientService) {
		this.clientService = clientService;
	}

	@GetMapping
	public List<ClientDto> listClients() {
		return clientService.listClients();
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public ClientDto createClient(@Valid @RequestBody ClientCreateRequest request) {
		return clientService.createClient(request);
	}

	@GetMapping("/{id}")
	public ClientDto getClient(@PathVariable Long id) {
		return clientService.getClient(id);
	}

	@PutMapping("/{id}")
	public ClientDto updateClient(@PathVariable Long id, @Valid @RequestBody ClientUpdateRequest request) {
		return clientService.updateClient(id, request);
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteClient(@PathVariable Long id, @RequestBody(required = false) ClientDeleteRequest request) {
		clientService.deleteClient(id, request);
	}
}
