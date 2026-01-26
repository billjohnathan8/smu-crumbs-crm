package com.itsa.crm.clients_service.service;

import com.itsa.crm.clients_service.dto.ClientCreateRequest;
import com.itsa.crm.clients_service.dto.ClientDeleteRequest;
import com.itsa.crm.clients_service.dto.ClientDto;
import com.itsa.crm.clients_service.dto.ClientUpdateRequest;
import java.util.List;

public interface ClientService {
	List<ClientDto> listClients();

	ClientDto getClient(Long id);

	ClientDto createClient(ClientCreateRequest request);

	ClientDto updateClient(Long id, ClientUpdateRequest request);

	void deleteClient(Long id, ClientDeleteRequest request);
}
