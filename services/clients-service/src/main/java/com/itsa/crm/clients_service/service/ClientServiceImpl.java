package com.itsa.crm.clients_service.service;

import com.itsa.crm.clients_service.dto.ClientCreateRequest;
import com.itsa.crm.clients_service.dto.ClientDeleteRequest;
import com.itsa.crm.clients_service.dto.ClientDto;
import com.itsa.crm.clients_service.dto.ClientPayload;
import com.itsa.crm.clients_service.dto.ClientUpdateRequest;
import com.itsa.crm.clients_service.entity.ClientEntity;
import com.itsa.crm.clients_service.exception.ClientNotFoundException;
import com.itsa.crm.clients_service.exception.DuplicateClientException;
import com.itsa.crm.clients_service.repository.ClientRepository;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ClientServiceImpl implements ClientService {
	private final ClientRepository clientRepository;

	public ClientServiceImpl(ClientRepository clientRepository) {
		this.clientRepository = clientRepository;
	}

	@Override
	public List<ClientDto> listClients() {
		return clientRepository.findAll().stream()
			.map(this::toDto)
			.collect(Collectors.toList());
	}

	@Override
	public ClientDto getClient(Long id) {
		ClientEntity client = clientRepository.findById(id)
			.orElseThrow(() -> new ClientNotFoundException(id));
		return toDto(client);
	}

	@Override
	@Transactional
	public ClientDto createClient(ClientCreateRequest request) {
		ClientPayload payload = request.client();
		checkCreateConflicts(payload.emailAddress(), payload.phoneNumber());
		ClientEntity entity = new ClientEntity();
		applyPayload(entity, payload);
		ClientEntity saved = clientRepository.save(entity);
		return toDto(saved);
	}

	@Override
	@Transactional
	public ClientDto updateClient(Long id, ClientUpdateRequest request) {
		ClientEntity entity = clientRepository.findById(id)
			.orElseThrow(() -> new ClientNotFoundException(id));
		ClientPayload payload = request.client();
		checkUpdateConflicts(id, payload.emailAddress(), payload.phoneNumber());
		applyPayload(entity, payload);
		ClientEntity saved = clientRepository.save(entity);
		return toDto(saved);
	}

	@Override
	@Transactional
	public void deleteClient(Long id, ClientDeleteRequest request) {
		ClientEntity entity = clientRepository.findById(id)
			.orElseThrow(() -> new ClientNotFoundException(id));
		clientRepository.delete(entity);
	}

	private void checkCreateConflicts(String emailAddress, String phoneNumber) {
		if (clientRepository.existsByEmailAddressIgnoreCase(emailAddress)) {
			throw new DuplicateClientException("Email address already exists.");
		}
		if (clientRepository.existsByPhoneNumber(phoneNumber)) {
			throw new DuplicateClientException("Phone number already exists.");
		}
	}

	private void checkUpdateConflicts(Long id, String emailAddress, String phoneNumber) {
		if (clientRepository.existsByEmailAddressIgnoreCaseAndIdNot(emailAddress, id)) {
			throw new DuplicateClientException("Email address already exists.");
		}
		if (clientRepository.existsByPhoneNumberAndIdNot(phoneNumber, id)) {
			throw new DuplicateClientException("Phone number already exists.");
		}
	}

	private void applyPayload(ClientEntity entity, ClientPayload payload) {
		entity.setFirstName(payload.firstName());
		entity.setLastName(payload.lastName());
		entity.setDateOfBirth(payload.dateOfBirth());
		entity.setGender(payload.gender());
		entity.setEmailAddress(payload.emailAddress());
		entity.setPhoneNumber(payload.phoneNumber());
		entity.setAddress(payload.address());
		entity.setCity(payload.city());
		entity.setState(payload.state());
		entity.setCountry(payload.country());
		entity.setPostalCode(payload.postalCode());
	}

	private ClientDto toDto(ClientEntity entity) {
		return new ClientDto(
			entity.getId(),
			entity.getFirstName(),
			entity.getLastName(),
			entity.getDateOfBirth(),
			entity.getGender(),
			entity.getEmailAddress(),
			entity.getPhoneNumber(),
			entity.getAddress(),
			entity.getCity(),
			entity.getState(),
			entity.getCountry(),
			entity.getPostalCode()
		);
	}
}
