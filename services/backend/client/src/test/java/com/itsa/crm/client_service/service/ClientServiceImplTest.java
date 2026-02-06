package com.itsa.crm.client_service.service;

import com.itsa.crm.client_service.dto.ClientCreateRequest;
import com.itsa.crm.client_service.dto.ClientPayload;
import com.itsa.crm.client_service.dto.ClientUpdateRequest;
import com.itsa.crm.client_service.dto.IdentityVerificationStatus;
import com.itsa.crm.client_service.dto.VerifyClientRequest;
import com.itsa.crm.client_service.entity.ClientEntity;
import com.itsa.crm.client_service.entity.Gender;
import com.itsa.crm.client_service.exception.ClientNotFoundException;
import com.itsa.crm.client_service.exception.DuplicateClientException;
import com.itsa.crm.client_service.logging.ClientAuditLogger;
import com.itsa.crm.client_service.repository.ClientRepository;
import com.itsa.crm.client_service.security.AuthenticatedUser;
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
import static org.mockito.ArgumentMatchers.eq;
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

	private static ClientEntity entityFromPayload(Long id, String assignedAgentId, ClientPayload payload) {
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
		e.setAssignedAgentId(assignedAgentId);
		e.setIdentityVerificationStatus(IdentityVerificationStatus.unverified);
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
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientPayload payload = samplePayload();
		ClientEntity e1 = entityFromPayload(1L, "usr_1", payload);
		ClientEntity e2 = entityFromPayload(2L, "usr_1", payload);
		when(clientRepository.searchByAgent(eq("usr_1"), eq(null))).thenReturn(List.of(e1, e2));

		List<com.itsa.crm.client_service.dto.ClientDto> result = clientService.listClients(agent, 50, 0, null).data();

		assertThat(result).hasSize(2);
		assertThat(result.get(0).clientId()).isEqualTo("clt_1");
		assertThat(result.get(0).firstName()).isEqualTo("Jordan");
		assertThat(result.get(1).clientId()).isEqualTo("clt_2");
		verify(clientRepository).searchByAgent("usr_1", null);
	}

	@Test
	void listClients_adminUsesSearchAll_andTrimsQueryAndNormalizesLimitOffset() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		ClientPayload payload = samplePayload();
		List<ClientEntity> all = List.of(
			entityFromPayload(1L, "usr_x", payload),
			entityFromPayload(2L, "usr_y", payload),
			entityFromPayload(3L, "usr_z", payload)
		);
		when(clientRepository.searchAll("Jordan")).thenReturn(all);

		var response = clientService.listClients(admin, 1000, -10, "   Jordan   ");

		assertThat(response.pagination().limit()).isEqualTo(200);
		assertThat(response.pagination().offset()).isEqualTo(0);
		assertThat(response.pagination().total()).isEqualTo(3);
		assertThat(response.data()).hasSize(3);
		verify(clientRepository).searchAll("Jordan");
	}

	/** Verifies that getClient(id) returns the client DTO when the repository finds the entity. */
	@Test
	void getClient_whenFound_returnsDto() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientPayload payload = samplePayload();
		ClientEntity entity = entityFromPayload(7L, "usr_1", payload);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));

		var result = clientService.getClient(agent, "clt_7", "Bearer x", "req-1");

		assertThat(result.clientId()).isEqualTo("clt_7");
		assertThat(result.emailAddress()).isEqualTo("jordan.taylor@example.com");
		verify(clientRepository).findById(7L);
	}

	@Test
	void getClient_agentCannotReadOtherOwnersClient_throwsNotFound() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientPayload payload = samplePayload();
		ClientEntity entity = entityFromPayload(7L, "usr_other", payload);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));

		assertThatThrownBy(() -> clientService.getClient(agent, "clt_7", "Bearer x", "req-1"))
			.isInstanceOf(ClientNotFoundException.class);
	}

	/** Verifies that getClient(id) throws ClientNotFoundException when the repository returns empty. */
	@Test
	void getClient_whenNotFound_throwsClientNotFoundException() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		when(clientRepository.findById(404L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> clientService.getClient(agent, "clt_404", "Bearer x", "req-1"))
			.isInstanceOf(ClientNotFoundException.class)
			.hasMessageContaining("not found");

		verify(clientRepository).findById(404L);
	}

	/** Verifies that createClient() checks email/phone uniqueness, saves the entity, and returns the new DTO. */
	@Test
	void createClient_whenNoConflict_returnsSavedDto() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientPayload payload = samplePayload();
		ClientCreateRequest request = new ClientCreateRequest(
			payload.firstName(),
			payload.lastName(),
			payload.dateOfBirth(),
			payload.gender(),
			payload.emailAddress(),
			payload.phoneNumber(),
			payload.address(),
			payload.city(),
			payload.state(),
			payload.country(),
			payload.postalCode()
		);
		when(clientRepository.existsByEmailAddressIgnoreCase(payload.emailAddress())).thenReturn(false);
		when(clientRepository.existsByPhoneNumber(payload.phoneNumber())).thenReturn(false);
		when(clientRepository.save(any())).thenAnswer(inv -> {
			ClientEntity e = inv.getArgument(0);
			if (e.getId() == null) e.setId(10L);
			return e;
		});

		var result = clientService.createClient(agent, request, "Bearer x", "req-1");

		assertThat(result.clientId()).isEqualTo("clt_10");
		assertThat(result.firstName()).isEqualTo("Jordan");
		assertThat(result.emailAddress()).isEqualTo("jordan.taylor@example.com");
		ArgumentCaptor<ClientEntity> captor = ArgumentCaptor.forClass(ClientEntity.class);
		verify(clientRepository).save(captor.capture());
		assertThat(captor.getValue().getFirstName()).isEqualTo("Jordan");
		assertThat(captor.getValue().getAssignedAgentId()).isEqualTo("usr_1");
		verify(clientRepository).existsByEmailAddressIgnoreCase(payload.emailAddress());
		verify(clientRepository).existsByPhoneNumber(payload.phoneNumber());
		verify(clientAuditLogger).logAuditEvent(
			eq("CREATE"),
			any(),
			any(),
			any(),
			eq("usr_1"),
			eq("clt_10"),
			eq("req-1"),
			eq("Bearer x")
		);
	}

	/** Verifies that createClient() throws DuplicateClientException when the email is already in use (no save). */
	@Test
	void createClient_whenEmailExists_throwsDuplicateClientException() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientPayload payload = samplePayload();
		ClientCreateRequest request = new ClientCreateRequest(
			payload.firstName(),
			payload.lastName(),
			payload.dateOfBirth(),
			payload.gender(),
			payload.emailAddress(),
			payload.phoneNumber(),
			payload.address(),
			payload.city(),
			payload.state(),
			payload.country(),
			payload.postalCode()
		);
		when(clientRepository.existsByEmailAddressIgnoreCase(payload.emailAddress())).thenReturn(true);

		assertThatThrownBy(() -> clientService.createClient(agent, request, "Bearer x", "req-1"))
			.isInstanceOf(DuplicateClientException.class)
			.hasMessageContaining("Email");

		verify(clientRepository).existsByEmailAddressIgnoreCase(payload.emailAddress());
		verify(clientRepository, never()).save(any());
	}

	/** Verifies that createClient() throws DuplicateClientException when the phone number is already in use (no save). */
	@Test
	void createClient_whenPhoneExists_throwsDuplicateClientException() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientPayload payload = samplePayload();
		ClientCreateRequest request = new ClientCreateRequest(
			payload.firstName(),
			payload.lastName(),
			payload.dateOfBirth(),
			payload.gender(),
			payload.emailAddress(),
			payload.phoneNumber(),
			payload.address(),
			payload.city(),
			payload.state(),
			payload.country(),
			payload.postalCode()
		);
		when(clientRepository.existsByEmailAddressIgnoreCase(payload.emailAddress())).thenReturn(false);
		when(clientRepository.existsByPhoneNumber(payload.phoneNumber())).thenReturn(true);

		assertThatThrownBy(() -> clientService.createClient(agent, request, "Bearer x", "req-1"))
			.isInstanceOf(DuplicateClientException.class)
			.hasMessageContaining("Phone");

		verify(clientRepository).existsByPhoneNumber(payload.phoneNumber());
		verify(clientRepository, never()).save(any());
	}

	/** Verifies that updateClient() loads the entity, checks email/phone for other ids, applies payload, saves, and returns DTO. */
	@Test
	void updateClient_whenFoundAndNoConflict_returnsUpdatedDto() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientPayload payload = samplePayload();
		ClientUpdateRequest request = new ClientUpdateRequest(
			payload.firstName(),
			payload.lastName(),
			payload.dateOfBirth(),
			payload.gender(),
			payload.emailAddress(),
			payload.phoneNumber(),
			payload.address(),
			payload.city(),
			payload.state(),
			payload.country(),
			payload.postalCode()
		);
		ClientEntity existing = entityFromPayload(12L, "usr_1", payload);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.existsByEmailAddressIgnoreCaseAndIdNot(payload.emailAddress(), 12L)).thenReturn(false);
		when(clientRepository.existsByPhoneNumberAndIdNot(payload.phoneNumber(), 12L)).thenReturn(false);
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		var result = clientService.updateClient(agent, "clt_12", request, "Bearer x", "req-1");

		assertThat(result.clientId()).isEqualTo("clt_12");
		assertThat(result.firstName()).isEqualTo("Jordan");
		verify(clientRepository).findById(12L);
		verify(clientRepository).save(existing);
		verify(clientAuditLogger).logAuditEvent(
			eq("UPDATE"),
			any(),
			any(),
			any(),
			eq("usr_1"),
			eq("clt_12"),
			eq("req-1"),
			eq("Bearer x")
		);
	}

	/** Verifies that updateClient() throws ClientNotFoundException when the client id does not exist (no save). */
	@Test
	void updateClient_whenNotFound_throwsClientNotFoundException() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientUpdateRequest request = new ClientUpdateRequest(null, null, null, null, null, null, null, null, null, null, null);
		when(clientRepository.findById(999L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> clientService.updateClient(agent, "clt_999", request, "Bearer x", "req-1"))
			.isInstanceOf(ClientNotFoundException.class)
			.hasMessageContaining("not found");

		verify(clientRepository).findById(999L);
		verify(clientRepository, never()).save(any());
	}

	/** Verifies that updateClient() throws DuplicateClientException when the new email belongs to another client (no save). */
	@Test
	void updateClient_whenEmailExistsForOtherId_throwsDuplicateClientException() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientPayload payload = samplePayload();
		ClientUpdateRequest request = new ClientUpdateRequest(null, null, null, null, payload.emailAddress(), null, null, null, null, null, null);
		ClientEntity existing = entityFromPayload(12L, "usr_1", payload);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.existsByEmailAddressIgnoreCaseAndIdNot(payload.emailAddress(), 12L)).thenReturn(true);

		assertThatThrownBy(() -> clientService.updateClient(agent, "clt_12", request, "Bearer x", "req-1"))
			.isInstanceOf(DuplicateClientException.class)
			.hasMessageContaining("Email");

		verify(clientRepository, never()).save(any());
	}

	/** Verifies that updateClient() throws DuplicateClientException when the new phone belongs to another client (no save). */
	@Test
	void updateClient_whenPhoneExistsForOtherId_throwsDuplicateClientException() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientPayload payload = samplePayload();
		ClientUpdateRequest request = new ClientUpdateRequest(null, null, null, null, null, payload.phoneNumber(), null, null, null, null, null);
		ClientEntity existing = entityFromPayload(12L, "usr_1", payload);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.existsByPhoneNumberAndIdNot(payload.phoneNumber(), 12L)).thenReturn(true);

		assertThatThrownBy(() -> clientService.updateClient(agent, "clt_12", request, "Bearer x", "req-1"))
			.isInstanceOf(DuplicateClientException.class)
			.hasMessageContaining("Phone");

		verify(clientRepository, never()).save(any());
	}

	/** Verifies that deleteClient() loads the entity and calls repository.delete (entity is removed). */
	@Test
	void deleteClient_whenFound_deletesEntity() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientPayload payload = samplePayload();
		ClientEntity entity = entityFromPayload(55L, "usr_1", payload);
		when(clientRepository.findById(55L)).thenReturn(Optional.of(entity));

		clientService.deleteClient(agent, "clt_55", "Bearer x", "req-1");

		verify(clientRepository).findById(55L);
		verify(clientRepository).delete(entity);
		verify(clientAuditLogger).logAuditEvent(
			eq("DELETE"),
			any(),
			any(),
			any(),
			eq("usr_1"),
			eq("clt_55"),
			eq("req-1"),
			eq("Bearer x")
		);
	}

	/** Verifies that deleteClient() throws ClientNotFoundException when the client id does not exist (no delete). */
	@Test
	void deleteClient_whenNotFound_throwsClientNotFoundException() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		when(clientRepository.findById(404L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> clientService.deleteClient(agent, "clt_404", "Bearer x", "req-1"))
			.isInstanceOf(ClientNotFoundException.class)
			.hasMessageContaining("not found");

		verify(clientRepository).findById(404L);
		verify(clientRepository, never()).delete(any());
	}

	@Test
	void createClient_whenLogPublishingFails_stillReturnsCreatedClient() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientPayload payload = samplePayload();
		ClientCreateRequest request = new ClientCreateRequest(
			payload.firstName(),
			payload.lastName(),
			payload.dateOfBirth(),
			payload.gender(),
			payload.emailAddress(),
			payload.phoneNumber(),
			payload.address(),
			payload.city(),
			payload.state(),
			payload.country(),
			payload.postalCode()
		);
		when(clientRepository.existsByEmailAddressIgnoreCase(payload.emailAddress())).thenReturn(false);
		when(clientRepository.existsByPhoneNumber(payload.phoneNumber())).thenReturn(false);
		when(clientRepository.save(any())).thenAnswer(inv -> {
			ClientEntity e = inv.getArgument(0);
			e.setId(20L);
			e.setAssignedAgentId("usr_1");
			return e;
		});
		doThrow(new RuntimeException("log service unavailable"))
			.when(clientAuditLogger).logAuditEvent(eq("CREATE"), any(), any(), any(), any(), any(), any(), any());

		var result = clientService.createClient(agent, request, "Bearer x", "req-1");

		assertThat(result.clientId()).isEqualTo("clt_20");
		verify(clientRepository).save(any());
		verify(clientAuditLogger).logAuditEvent(eq("CREATE"), any(), any(), any(), any(), any(), any(), any());
	}

	@Test
	void createClient_authorizationHeaderBlank_skipsAuditLogging_andLowercasesEmail() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientCreateRequest request = new ClientCreateRequest(
			"Jordan",
			"Taylor",
			LocalDate.of(1990, 1, 15),
			Gender.MALE,
			"JORDAN.TAYLOR@EXAMPLE.COM",
			"+15551234567",
			"123 Main Street",
			"Springfield",
			"Illinois",
			"United States",
			"62704"
		);
		when(clientRepository.existsByEmailAddressIgnoreCase("JORDAN.TAYLOR@EXAMPLE.COM")).thenReturn(false);
		when(clientRepository.existsByPhoneNumber("+15551234567")).thenReturn(false);
		ArgumentCaptor<ClientEntity> captor = ArgumentCaptor.forClass(ClientEntity.class);
		when(clientRepository.save(captor.capture())).thenAnswer(inv -> {
			ClientEntity e = inv.getArgument(0);
			e.setId(21L);
			return e;
		});

		var created = clientService.createClient(agent, request, "   ", "req-1");

		assertThat(created.clientId()).isEqualTo("clt_21");
		assertThat(captor.getValue().getEmailAddress()).isEqualTo("jordan.taylor@example.com");
		verify(clientAuditLogger, never()).logAuditEvent(any(), any(), any(), any(), any(), any(), any(), any());
	}

	@Test
	void verifyClient_setsStatusToVerified_andAuditsWithNullBeforeValueWhenStatusWasNull() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		ClientPayload payload = samplePayload();
		ClientEntity entity = entityFromPayload(7L, "usr_1", payload);
		entity.setIdentityVerificationStatus(null);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		var response = clientService.verifyClient(
			agent,
			"clt_7",
			new VerifyClientRequest("S1234567A", "NRIC", null),
			"Bearer x",
			"req-1"
		);

		assertThat(response.clientId()).isEqualTo("clt_7");
		assertThat(response.identityVerificationStatus()).isEqualTo(IdentityVerificationStatus.verified);
		verify(clientAuditLogger).logAuditEvent(
			eq("UPDATE"),
			eq("identityVerificationStatus"),
			eq(null),
			eq("verified"),
			eq("usr_1"),
			eq("clt_7"),
			eq("req-1"),
			eq("Bearer x")
		);
	}
}
