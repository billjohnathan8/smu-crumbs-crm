package com.itsa.crm.clients_service.service;

import com.itsa.crm.clients_service.dto.ClientCreateRequest;
import com.itsa.crm.clients_service.dto.ClientPayload;
import com.itsa.crm.clients_service.dto.ClientUpdateRequest;
import com.itsa.crm.clients_service.entity.ClientEntity;
import com.itsa.crm.clients_service.entity.Gender;
import com.itsa.crm.clients_service.exception.ClientNotFoundException;
import com.itsa.crm.clients_service.exception.DuplicateClientException;
import com.itsa.crm.clients_service.logging.ClientAuditLogger;
import com.itsa.crm.clients_service.repository.ClientRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ClientServiceImpl}: business logic for listing, getting, creating,
 * updating, and deleting clients, including conflict checks and not-found handling.
 */
@ExtendWith(MockitoExtension.class)
class ClientServiceImplTest {

	private ClientRepository clientRepository;
	private ClientAuditLogger clientAuditLogger;
	private ClientServiceImpl clientService;

	private static ClientPayload samplePayload() {
		return new ClientPayload(
			"Jordan",
			"Taylor",
			LocalDate.of(1990, 1, 15),
			Gender.MALE,
			"jordan.taylor@example.com",
			"+15551234567",
			"123 Main Street",
			"Springfield",
			"Illinois",
			"United States",
			"62704"
		);
	}

	private static ClientEntity entityFromPayload(Long id, ClientPayload payload) {
		ClientEntity e = new ClientEntity();
		e.setId(id);
		e.setFirstName(payload.firstName());
		e.setLastName(payload.lastName());
		e.setDateOfBirth(payload.dateOfBirth());
		e.setGender(payload.gender());
		e.setEmailAddress(payload.emailAddress());
		e.setPhoneNumber(payload.phoneNumber());
		e.setAddress(payload.address());
		e.setCity(payload.city());
		e.setState(payload.state());
		e.setCountry(payload.country());
		e.setPostalCode(payload.postalCode());
		return e;
	}

	@BeforeEach
	void setUp() {
		clientRepository = org.mockito.Mockito.mock(ClientRepository.class);
		clientAuditLogger = org.mockito.Mockito.mock(ClientAuditLogger.class);
		clientService = new ClientServiceImpl(clientRepository, clientAuditLogger);
	}

	/** Verifies that listClients() returns all entities from the repository mapped to DTOs. */
	@Test
	void listClients_returnsAllAsDtos() {
		ClientPayload payload = samplePayload();
		ClientEntity e1 = entityFromPayload(1L, payload);
		ClientEntity e2 = entityFromPayload(2L, payload);
		when(clientRepository.findAll()).thenReturn(List.of(e1, e2));

		List<com.itsa.crm.clients_service.dto.ClientDto> result = clientService.listClients();

		assertThat(result).hasSize(2);
		assertThat(result.get(0).clientId()).isEqualTo(1L);
		assertThat(result.get(0).firstName()).isEqualTo("Jordan");
		assertThat(result.get(1).clientId()).isEqualTo(2L);
		verify(clientRepository).findAll();
	}

	/** Verifies that getClient(id) returns the client DTO when the repository finds the entity. */
	@Test
	void getClient_whenFound_returnsDto() {
		ClientPayload payload = samplePayload();
		ClientEntity entity = entityFromPayload(7L, payload);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));

		var result = clientService.getClient(7L);

		assertThat(result.clientId()).isEqualTo(7L);
		assertThat(result.emailAddress()).isEqualTo("jordan.taylor@example.com");
		verify(clientRepository).findById(7L);
	}

	/** Verifies that getClient(id) throws ClientNotFoundException when the repository returns empty. */
	@Test
	void getClient_whenNotFound_throwsClientNotFoundException() {
		when(clientRepository.findById(404L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> clientService.getClient(404L))
			.isInstanceOf(ClientNotFoundException.class)
			.hasMessageContaining("404");

		verify(clientRepository).findById(404L);
	}

	/** Verifies that createClient() checks email/phone uniqueness, saves the entity, and returns the new DTO. */
	@Test
	void createClient_whenNoConflict_returnsSavedDto() {
		ClientPayload payload = samplePayload();
		ClientCreateRequest request = new ClientCreateRequest(payload, "agent-123");
		when(clientRepository.existsByEmailAddressIgnoreCase(payload.emailAddress())).thenReturn(false);
		when(clientRepository.existsByPhoneNumber(payload.phoneNumber())).thenReturn(false);
		when(clientRepository.save(any())).thenAnswer(inv -> {
			ClientEntity e = inv.getArgument(0);
			if (e.getId() == null) e.setId(10L);
			return e;
		});

		var result = clientService.createClient(request);

		assertThat(result.clientId()).isEqualTo(10L);
		assertThat(result.firstName()).isEqualTo("Jordan");
		assertThat(result.emailAddress()).isEqualTo("jordan.taylor@example.com");
		ArgumentCaptor<ClientEntity> captor = ArgumentCaptor.forClass(ClientEntity.class);
		verify(clientRepository).save(captor.capture());
		assertThat(captor.getValue().getFirstName()).isEqualTo("Jordan");
		verify(clientRepository).existsByEmailAddressIgnoreCase(payload.emailAddress());
		verify(clientRepository).existsByPhoneNumber(payload.phoneNumber());
		verify(clientAuditLogger).logClientEvent("CREATE", 10L, "agent-123", payload);
	}

	/** Verifies that createClient() throws DuplicateClientException when the email is already in use (no save). */
	@Test
	void createClient_whenEmailExists_throwsDuplicateClientException() {
		ClientPayload payload = samplePayload();
		ClientCreateRequest request = new ClientCreateRequest(payload, "agent-123");
		when(clientRepository.existsByEmailAddressIgnoreCase(payload.emailAddress())).thenReturn(true);

		assertThatThrownBy(() -> clientService.createClient(request))
			.isInstanceOf(DuplicateClientException.class)
			.hasMessageContaining("Email");

		verify(clientRepository).existsByEmailAddressIgnoreCase(payload.emailAddress());
		verify(clientRepository, never()).save(any());
	}

	/** Verifies that createClient() throws DuplicateClientException when the phone number is already in use (no save). */
	@Test
	void createClient_whenPhoneExists_throwsDuplicateClientException() {
		ClientPayload payload = samplePayload();
		ClientCreateRequest request = new ClientCreateRequest(payload, "agent-123");
		when(clientRepository.existsByEmailAddressIgnoreCase(payload.emailAddress())).thenReturn(false);
		when(clientRepository.existsByPhoneNumber(payload.phoneNumber())).thenReturn(true);

		assertThatThrownBy(() -> clientService.createClient(request))
			.isInstanceOf(DuplicateClientException.class)
			.hasMessageContaining("Phone");

		verify(clientRepository).existsByPhoneNumber(payload.phoneNumber());
		verify(clientRepository, never()).save(any());
	}

	/** Verifies that updateClient() loads the entity, checks email/phone for other ids, applies payload, saves, and returns DTO. */
	@Test
	void updateClient_whenFoundAndNoConflict_returnsUpdatedDto() {
		ClientPayload payload = samplePayload();
		ClientUpdateRequest request = new ClientUpdateRequest(payload, "agent-456");
		ClientEntity existing = entityFromPayload(12L, payload);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.existsByEmailAddressIgnoreCaseAndIdNot(payload.emailAddress(), 12L)).thenReturn(false);
		when(clientRepository.existsByPhoneNumberAndIdNot(payload.phoneNumber(), 12L)).thenReturn(false);
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		var result = clientService.updateClient(12L, request);

		assertThat(result.clientId()).isEqualTo(12L);
		assertThat(result.firstName()).isEqualTo("Jordan");
		verify(clientRepository).findById(12L);
		verify(clientRepository).save(existing);
		verify(clientAuditLogger).logClientEvent("UPDATE", 12L, "agent-456", payload);
	}

	/** Verifies that updateClient() throws ClientNotFoundException when the client id does not exist (no save). */
	@Test
	void updateClient_whenNotFound_throwsClientNotFoundException() {
		ClientUpdateRequest request = new ClientUpdateRequest(samplePayload(), "agent-456");
		when(clientRepository.findById(999L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> clientService.updateClient(999L, request))
			.isInstanceOf(ClientNotFoundException.class)
			.hasMessageContaining("999");

		verify(clientRepository).findById(999L);
		verify(clientRepository, never()).save(any());
	}

	/** Verifies that updateClient() throws DuplicateClientException when the new email belongs to another client (no save). */
	@Test
	void updateClient_whenEmailExistsForOtherId_throwsDuplicateClientException() {
		ClientPayload payload = samplePayload();
		ClientUpdateRequest request = new ClientUpdateRequest(payload, "agent-456");
		ClientEntity existing = entityFromPayload(12L, payload);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.existsByEmailAddressIgnoreCaseAndIdNot(payload.emailAddress(), 12L)).thenReturn(true);

		assertThatThrownBy(() -> clientService.updateClient(12L, request))
			.isInstanceOf(DuplicateClientException.class)
			.hasMessageContaining("Email");

		verify(clientRepository, never()).save(any());
	}

	/** Verifies that updateClient() throws DuplicateClientException when the new phone belongs to another client (no save). */
	@Test
	void updateClient_whenPhoneExistsForOtherId_throwsDuplicateClientException() {
		ClientPayload payload = samplePayload();
		ClientUpdateRequest request = new ClientUpdateRequest(payload, "agent-456");
		ClientEntity existing = entityFromPayload(12L, payload);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.existsByEmailAddressIgnoreCaseAndIdNot(payload.emailAddress(), 12L)).thenReturn(false);
		when(clientRepository.existsByPhoneNumberAndIdNot(payload.phoneNumber(), 12L)).thenReturn(true);

		assertThatThrownBy(() -> clientService.updateClient(12L, request))
			.isInstanceOf(DuplicateClientException.class)
			.hasMessageContaining("Phone");

		verify(clientRepository, never()).save(any());
	}

	/** Verifies that deleteClient() loads the entity and calls repository.delete (entity is removed). */
	@Test
	void deleteClient_whenFound_deletesEntity() {
		ClientPayload payload = samplePayload();
		ClientEntity entity = entityFromPayload(55L, payload);
		when(clientRepository.findById(55L)).thenReturn(Optional.of(entity));

		clientService.deleteClient(55L, null);

		verify(clientRepository).findById(55L);
		verify(clientRepository).delete(entity);
		verify(clientAuditLogger).logClientEvent("DELETE", 55L, null, samplePayload());
	}

	/** Verifies that deleteClient() throws ClientNotFoundException when the client id does not exist (no delete). */
	@Test
	void deleteClient_whenNotFound_throwsClientNotFoundException() {
		when(clientRepository.findById(404L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> clientService.deleteClient(404L, null))
			.isInstanceOf(ClientNotFoundException.class)
			.hasMessageContaining("404");

		verify(clientRepository).findById(404L);
		verify(clientRepository, never()).delete(any());
	}

	@Test
	void createClient_whenLogPublishingFails_stillReturnsCreatedClient() {
		ClientPayload payload = samplePayload();
		ClientCreateRequest request = new ClientCreateRequest(payload, "agent-123");
		when(clientRepository.existsByEmailAddressIgnoreCase(payload.emailAddress())).thenReturn(false);
		when(clientRepository.existsByPhoneNumber(payload.phoneNumber())).thenReturn(false);
		when(clientRepository.save(any())).thenAnswer(inv -> {
			ClientEntity e = inv.getArgument(0);
			e.setId(20L);
			return e;
		});
		doThrow(new RuntimeException("log service unavailable"))
			.when(clientAuditLogger).logClientEvent("CREATE", 20L, "agent-123", payload);

		var result = clientService.createClient(request);

		assertThat(result.clientId()).isEqualTo(20L);
		verify(clientRepository).save(any());
		verify(clientAuditLogger).logClientEvent("CREATE", 20L, "agent-123", payload);
	}
}
