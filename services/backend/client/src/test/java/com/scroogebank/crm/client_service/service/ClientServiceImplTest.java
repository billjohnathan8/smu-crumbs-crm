package com.scroogebank.crm.client_service.service;

import com.scroogebank.crm.client_service.dto.ClientCreateRequest;
import com.scroogebank.crm.client_service.dto.ClientPayload;
import com.scroogebank.crm.client_service.dto.ReassignRequest;
import com.scroogebank.crm.client_service.dto.ClientUpdateRequest;
import com.scroogebank.crm.client_service.dto.IdentityVerificationStatus;
import com.scroogebank.crm.client_service.dto.ReviewVerificationRequest;
import com.scroogebank.crm.client_service.dto.UploadVerificationDocsRequest;
import com.scroogebank.crm.client_service.entity.ClientEntity;
import com.scroogebank.crm.client_service.entity.Gender;
import com.scroogebank.crm.client_service.exception.ClientNotFoundException;
import com.scroogebank.crm.client_service.exception.DuplicateClientException;
import com.scroogebank.crm.client_service.exception.SnsPublishException;
import com.scroogebank.crm.client_service.logging.ClientAuditLogger;
import com.scroogebank.crm.client_service.repository.AccountRepository;
import com.scroogebank.crm.client_service.repository.ClientRepository;
import com.scroogebank.crm.client_service.security.AuthenticatedUser;
import com.scroogebank.crm.client_service.security.UnauthorizedException;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ClientServiceImpl}: business logic for listing, getting, creating,
 * updating, and deleting clients, including conflict checks and not-found handling.
 */
@ExtendWith(MockitoExtension.class)
class ClientServiceImplTest {
	private static final long DEFAULT_VERIFICATION_LINK_TTL_SECONDS = 900L;

	@Mock
	private ClientRepository clientRepository;
	@Mock
	private AccountRepository accountRepository;
	@Mock
	private ClientAuditLogger clientAuditLogger;
	@Mock
	private DocumentStorageService documentStorageService;
	@Mock
	private VerificationTokenService verificationTokenService;
	@Mock
	private SnsEmailPublisherService snsEmailPublisherService;
	@InjectMocks
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

	private static ClientEntity entityFromPayload(Long id, String assignedUserId, ClientPayload payload) {
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
		e.setAssignedAgentId(assignedUserId);
		e.setIdentityVerificationStatus(IdentityVerificationStatus.unverified);
		return e;
	}

	private ClientCreateRequest requestFrom(ClientPayload payload) {
        return new ClientCreateRequest(
            payload.firstName(), payload.lastName(), payload.dateOfBirth(),
            payload.gender(), payload.emailAddress(), payload.phoneNumber(),
            payload.address(), payload.city(), payload.state(),
            payload.country(), payload.postalCode()
        );
    }

	private static UploadVerificationDocsRequest validUploadRequest(String token) {
		return new UploadVerificationDocsRequest(
			"NRIC",         "nric_front.jpg", "base64PrimaryData==", "image/jpeg",
			"UTILITY_BILL", "bill.pdf",       "base64AddressData==", "application/pdf",
			token
		);
	}

	/** Verifies that listClients() returns all entities from the repository mapped to DTOs. */
	@Test
	void listClients_returnsAllAsDtos() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientEntity e1 = entityFromPayload(1L, "usr_1", payload);
		ClientEntity e2 = entityFromPayload(2L, "usr_1", payload);
		when(clientRepository.searchByAgentWithFilters(eq("usr_1"), eq(null), eq(null))).thenReturn(List.of(e1, e2));

		List<com.scroogebank.crm.client_service.dto.ClientDto> result = clientService.listClients(user, 50, 0, null, null, null).data();

		assertThat(result).hasSize(2);
		assertThat(result.get(0).clientId()).isEqualTo("clt_1");
		assertThat(result.get(0).firstName()).isEqualTo("Jordan");
		assertThat(result.get(1).clientId()).isEqualTo("clt_2");
		verify(clientRepository).searchByAgentWithFilters("usr_1", null, null);
	}

	@Test
	void listClients_adminUsesSearchAll_andTrimsQueryAndNormalizesLimitOffset() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		ClientPayload payload = samplePayload();
		List<ClientEntity> all = List.of(
			entityFromPayload(1L, "usr_x", payload),
			entityFromPayload(2L, "usr_y", payload),
			entityFromPayload(3L, "usr_z", payload)
		);
		when(clientRepository.searchAllWithFilters("Jordan", null, null)).thenReturn(all);

		var response = clientService.listClients(admin, 1000, -10, "   Jordan   ", null, null);

		assertThat(response.pagination().limit()).isEqualTo(200);
		assertThat(response.pagination().offset()).isEqualTo(0);
		assertThat(response.pagination().total()).isEqualTo(3);
		assertThat(response.data()).hasSize(3);
		verify(clientRepository).searchAllWithFilters("Jordan", null, null);
	}

	@Test
	void listClients_withFilters_returnsFilteredResults() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		ClientPayload payload = samplePayload();
		ClientEntity e1 = entityFromPayload(1L, "usr_2", payload);
		e1.setIdentityVerificationStatus(IdentityVerificationStatus.verified);
		when(clientRepository.searchAllWithFilters("john", IdentityVerificationStatus.verified, "usr_2")).thenReturn(List.of(e1));

		var response = clientService.listClients(admin, 50, 0, "john", IdentityVerificationStatus.verified, "usr_2");

		assertThat(response.data()).hasSize(1);
		assertThat(response.data().get(0).identityVerificationStatus()).isEqualTo(IdentityVerificationStatus.verified);
		assertThat(response.data().get(0).assignedUserId()).isEqualTo("usr_2");
		verify(clientRepository).searchAllWithFilters("john", IdentityVerificationStatus.verified, "usr_2");
	}

	/** Verifies that getClient(id) returns the client DTO when the repository finds the entity. */
	@Test
	void getClient_whenFound_returnsDto() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientEntity entity = entityFromPayload(7L, "usr_1", payload);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));

		var result = clientService.getClient(user, "clt_7", "Bearer x", "req-1");

		assertThat(result.clientId()).isEqualTo("clt_7");
		assertThat(result.emailAddress()).isEqualTo("jordan.taylor@example.com");
		verify(clientRepository).findById(7L);
	}

	@Test
	void getClient_agentCannotReadOtherOwnersClient_throwsNotFound() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientEntity entity = entityFromPayload(7L, "usr_other", payload);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));

		assertThatThrownBy(() -> clientService.getClient(user, "clt_7", "Bearer x", "req-1"))
			.isInstanceOf(ClientNotFoundException.class);
	}

	@Test
	void updateClient_agentCannotUpdateOtherOwnersClient_throwsNotFound() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientEntity entity = entityFromPayload(7L, "usr_other", payload);
		ClientUpdateRequest request = new ClientUpdateRequest("NewName", null, null, null, null, null, null, null, null, null, null, null);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));

		assertThatThrownBy(() -> clientService.updateClient(user, "clt_7", request, "Bearer x", "req-1"))
			.isInstanceOf(ClientNotFoundException.class);
		verify(clientRepository, never()).save(any());
	}

	@Test
	void deleteClient_agentCannotDeleteOtherOwnersClient_throwsNotFound() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientEntity entity = entityFromPayload(7L, "usr_other", payload);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));

		assertThatThrownBy(() -> clientService.deleteClient(user, "clt_7", "Bearer x", "req-1"))
			.isInstanceOf(ClientNotFoundException.class);
		verify(clientRepository, never()).delete(any());
	}

	/** Verifies that getClient(id) throws ClientNotFoundException when the repository returns empty. */
	@Test
	void getClient_whenNotFound_throwsClientNotFoundException() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		when(clientRepository.findById(404L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> clientService.getClient(user, "clt_404", "Bearer x", "req-1"))
			.isInstanceOf(ClientNotFoundException.class)
			.hasMessageContaining("not found");

		verify(clientRepository).findById(404L);
	}

	/** Verifies that createClient() checks email/phone uniqueness, saves the entity, and returns the new DTO. */
	@Test
	void createClient_whenNoConflict_returnsSavedDto() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();

		when(clientRepository.existsByEmailAddressIgnoreCase(payload.emailAddress())).thenReturn(false);
		when(clientRepository.existsByPhoneNumber(payload.phoneNumber())).thenReturn(false);
		when(clientRepository.save(any())).thenAnswer(inv -> {
			ClientEntity e = inv.getArgument(0);
			if (e.getId() == null) e.setId(10L);
			return e;
		});
        when(verificationTokenService.generateVerificationToken(any(), anyLong())).thenReturn("signed-token-abc");

		var result = clientService.createClient(user, requestFrom(payload), "Bearer x", "req-1");

		assertThat(result.clientId()).isEqualTo("clt_10");
		assertThat(result.firstName()).isEqualTo("Jordan");
		assertThat(result.emailAddress()).isEqualTo("jordan.taylor@example.com");

		ArgumentCaptor<ClientEntity> captor = ArgumentCaptor.forClass(ClientEntity.class);
		verify(clientRepository).save(captor.capture());
		assertThat(captor.getValue().getFirstName()).isEqualTo("Jordan");
		assertThat(captor.getValue().getAssignedAgentId()).isEqualTo("usr_1");
		
		verify(clientRepository).existsByEmailAddressIgnoreCase(payload.emailAddress());
		verify(clientRepository).existsByPhoneNumber(payload.phoneNumber());
		verify(verificationTokenService).generateVerificationToken("clt_10", DEFAULT_VERIFICATION_LINK_TTL_SECONDS);
		verify(clientAuditLogger).logAuditEvent(
			eq("CREATE"),
			eq("Client ID"),
			eq(null),
			eq("clt_10"),
			eq("usr_1"),
			eq("clt_10"),
			eq("req-1"),
			eq("Bearer x")
		);
		verify(snsEmailPublisherService).publishVerificationEmail(
            eq("clt_10"),
            eq("jordan.taylor@example.com"),
            eq("signed-token-abc"),
            eq("Jordan"),
            eq("req-1"),
			eq(DEFAULT_VERIFICATION_LINK_TTL_SECONDS)
        );
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
	void createClient_whenSnsPublishFails_throwsAndAbortsCreate() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();

		when(clientRepository.existsByEmailAddressIgnoreCase(payload.emailAddress())).thenReturn(false);
		when(clientRepository.existsByPhoneNumber(payload.phoneNumber())).thenReturn(false);
		when(clientRepository.save(any())).thenAnswer(inv -> {
			ClientEntity e = inv.getArgument(0);
			if (e.getId() == null) {
				e.setId(10L);
			}
			return e;
		});
		when(verificationTokenService.generateVerificationToken(any(), anyLong())).thenReturn("signed-token-abc");
		doThrow(new SnsPublishException("sns down"))
			.when(snsEmailPublisherService)
			.publishVerificationEmail(any(), any(), any(), any(), any(), anyLong());

		assertThatThrownBy(() -> clientService.createClient(user, requestFrom(payload), "Bearer x", "req-1"))
			.isInstanceOf(SnsPublishException.class)
			.hasMessageContaining("sns down");
		verify(clientRepository).save(any());
	}

	/** Verifies that createClient() throws DuplicateClientException when the email is already in use (no save). */
	@Test
	void createClient_whenEmailExists_throwsDuplicateClientException() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();

		when(clientRepository.existsByEmailAddressIgnoreCase(payload.emailAddress())).thenReturn(true);

		assertThatThrownBy(() -> clientService.createClient(user, requestFrom(payload), "Bearer x", "req-1"))
			.isInstanceOf(DuplicateClientException.class)
			.hasMessageContaining("Email");

		verify(clientRepository).existsByEmailAddressIgnoreCase(payload.emailAddress());
		verify(clientRepository, never()).save(any());
	}

	/** Verifies that createClient() throws DuplicateClientException when the phone number is already in use (no save). */
	@Test
	void createClient_whenPhoneExists_throwsDuplicateClientException() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();

		when(clientRepository.existsByEmailAddressIgnoreCase(payload.emailAddress())).thenReturn(false);
		when(clientRepository.existsByPhoneNumber(payload.phoneNumber())).thenReturn(true);

		assertThatThrownBy(() -> clientService.createClient(user, requestFrom(payload), "Bearer x", "req-1"))
			.isInstanceOf(DuplicateClientException.class)
			.hasMessageContaining("Phone");

		verify(clientRepository).existsByPhoneNumber(payload.phoneNumber());
		verify(clientRepository, never()).save(any());
	}

	@Test
	void createClient_invalidPostalCodeForCountry_throwsValidationError() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
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
			"Singapore",
			"62704"
		);

		assertThatThrownBy(() -> clientService.createClient(user, request, "Bearer x", "req-1"))
			.isInstanceOf(IllegalArgumentException.class)
			.hasMessageContaining("Postal code must match Singapore format");

		verify(clientRepository, never()).save(any());
	}

	/** Verifies that updateClient() loads the entity, checks email/phone for other ids, applies payload, saves, and returns DTO. */
	@Test
	void updateClient_whenFoundAndNoConflict_returnsUpdatedDto() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
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
			payload.postalCode(),
			null
		);
		ClientEntity existing = entityFromPayload(12L, "usr_1", payload);
		existing.setFirstName("OldFirst");
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.existsByEmailAddressIgnoreCaseAndIdNot(payload.emailAddress(), 12L)).thenReturn(false);
		when(clientRepository.existsByPhoneNumberAndIdNot(payload.phoneNumber(), 12L)).thenReturn(false);
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		var result = clientService.updateClient(user, "clt_12", request, "Bearer x", "req-1");

		assertThat(result.clientId()).isEqualTo("clt_12");
		assertThat(result.firstName()).isEqualTo("Jordan");
		verify(clientRepository).findById(12L);
		verify(clientRepository).save(existing);
		verify(clientAuditLogger).logAuditEvent(
			eq("UPDATE"),
			eq("firstName"),
			eq("OldFirst"),
			eq("Jordan"),
			eq("usr_1"),
			eq("clt_12"),
			eq("req-1"),
			eq("Bearer x")
		);
	}

	@Test
	void updateClient_adminCanReassignClientAndAuditAssignedUserIdChange() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		ClientPayload payload = samplePayload();
		ClientEntity existing = entityFromPayload(12L, "usr_1", payload);
		ClientUpdateRequest request = new ClientUpdateRequest(
			null, null, null, null, null, null, null, null, null, null, null, "usr_2"
		);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		var result = clientService.updateClient(admin, "clt_12", request, "Bearer x", "req-1");

		assertThat(result.assignedUserId()).isEqualTo("usr_2");
		assertThat(existing.getAssignedAgentId()).isEqualTo("usr_2");
		verify(clientAuditLogger).logAuditEvent(
			eq("UPDATE"),
			eq("assignedUserId"),
			eq("[REDACTED]"),
			eq("[REDACTED]"),
			eq("usr_1"),
			eq("clt_12"),
			eq("req-1"),
			eq("Bearer x")
		);
	}

	@Test
	void updateClient_nonAdminCannotReassignClient_throwsAccessDenied() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientEntity existing = entityFromPayload(12L, "usr_1", payload);
		ClientUpdateRequest request = new ClientUpdateRequest(
			null, null, null, null, null, null, null, null, null, null, null, "usr_2"
		);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));

		assertThatThrownBy(() -> clientService.updateClient(user, "clt_12", request, "Bearer x", "req-1"))
			.isInstanceOf(AccessDeniedException.class)
			.hasMessageContaining("Root admin role required for client reassignment");

		verify(clientRepository, never()).save(any());
	}

	/** Verifies that updateClient() throws ClientNotFoundException when the client id does not exist (no save). */
	@Test
	void updateClient_whenNotFound_throwsClientNotFoundException() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientUpdateRequest request = new ClientUpdateRequest(null, null, null, null, null, null, null, null, null, null, null, null);
		when(clientRepository.findById(999L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> clientService.updateClient(user, "clt_999", request, "Bearer x", "req-1"))
			.isInstanceOf(ClientNotFoundException.class)
			.hasMessageContaining("not found");

		verify(clientRepository).findById(999L);
		verify(clientRepository, never()).save(any());
	}

	/** Verifies that updateClient() throws DuplicateClientException when the new email belongs to another client (no save). */
	@Test
	void updateClient_whenEmailExistsForOtherId_throwsDuplicateClientException() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientUpdateRequest request = new ClientUpdateRequest(null, null, null, null, payload.emailAddress(), null, null, null, null, null, null, null);
		ClientEntity existing = entityFromPayload(12L, "usr_1", payload);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.existsByEmailAddressIgnoreCaseAndIdNot(payload.emailAddress(), 12L)).thenReturn(true);

		assertThatThrownBy(() -> clientService.updateClient(user, "clt_12", request, "Bearer x", "req-1"))
			.isInstanceOf(DuplicateClientException.class)
			.hasMessageContaining("Email");

		verify(clientRepository, never()).save(any());
	}

	/** Verifies that updateClient() throws DuplicateClientException when the new phone belongs to another client (no save). */
	@Test
	void updateClient_whenPhoneExistsForOtherId_throwsDuplicateClientException() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientUpdateRequest request = new ClientUpdateRequest(null, null, null, null, null, payload.phoneNumber(), null, null, null, null, null, null);
		ClientEntity existing = entityFromPayload(12L, "usr_1", payload);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.existsByPhoneNumberAndIdNot(payload.phoneNumber(), 12L)).thenReturn(true);

		assertThatThrownBy(() -> clientService.updateClient(user, "clt_12", request, "Bearer x", "req-1"))
			.isInstanceOf(DuplicateClientException.class)
			.hasMessageContaining("Phone");

		verify(clientRepository, never()).save(any());
	}

	@Test
	void updateClient_withOnlyPostalCodeChange_validatesAgainstExistingCountry() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientEntity existing = entityFromPayload(12L, "usr_1", payload);
		existing.setCountry("Singapore");
		existing.setPostalCode("123456");
		ClientUpdateRequest request = new ClientUpdateRequest(
			null, null, null, null, null, null, null, null, null, null, "ABCDE", null
		);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));

		assertThatThrownBy(() -> clientService.updateClient(user, "clt_12", request, "Bearer x", "req-1"))
			.isInstanceOf(IllegalArgumentException.class)
			.hasMessageContaining("Postal code must match Singapore format");

		verify(clientRepository, never()).save(any());
	}

	/** Verifies that deleteClient() loads the entity and calls repository.delete (entity is removed). */
	@Test
	void deleteClient_whenFound_deletesEntity() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientEntity entity = entityFromPayload(55L, "usr_1", payload);
		when(clientRepository.findById(55L)).thenReturn(Optional.of(entity));

		clientService.deleteClient(user, "clt_55", "Bearer x", "req-1");

		verify(clientRepository).findById(55L);
		ArgumentCaptor<ClientEntity> deletedCaptor = ArgumentCaptor.forClass(ClientEntity.class);
		verify(clientRepository).save(deletedCaptor.capture());
		assertThat(deletedCaptor.getValue().isDeleted()).isTrue();
		verify(accountRepository).softDeleteByClientId(55L);
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
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		when(clientRepository.findById(404L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> clientService.deleteClient(user, "clt_404", "Bearer x", "req-1"))
			.isInstanceOf(ClientNotFoundException.class)
			.hasMessageContaining("not found");

		verify(clientRepository).findById(404L);
		verify(clientRepository, never()).delete(any());
	}

	@Test
	void updateClient_singleFieldChange_auditLogContainsFieldNameAndValues() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientEntity existing = entityFromPayload(12L, "usr_1", payload);
		ClientUpdateRequest request = new ClientUpdateRequest(
			"NewName", null, null, null, null, null, null, null, null, null, null, null
		);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		clientService.updateClient(user, "clt_12", request, "Bearer x", "req-1");

		verify(clientAuditLogger).logAuditEvent(
			eq("UPDATE"),
			eq("firstName"),
			eq("Jordan"),
			eq("NewName"),
			eq("usr_1"),
			eq("clt_12"),
			eq("req-1"),
			eq("Bearer x")
		);
	}

	@Test
	void updateClient_multipleFieldChanges_auditLogPipeDelimited() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientEntity existing = entityFromPayload(12L, "usr_1", payload);
		ClientUpdateRequest request = new ClientUpdateRequest(
			"NewFirst", "NewLast", null, null, null, null, null, null, null, null, null, null
		);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		clientService.updateClient(user, "clt_12", request, "Bearer x", "req-1");

		verify(clientAuditLogger).logAuditEvent(
			eq("UPDATE"),
			eq("firstName|lastName"),
			eq("Jordan|Taylor"),
			eq("NewFirst|NewLast"),
			eq("usr_1"),
			eq("clt_12"),
			eq("req-1"),
			eq("Bearer x")
		);
	}

	@Test
	void updateClient_noFieldsChanged_skipsAuditLogging() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientEntity existing = entityFromPayload(12L, "usr_1", payload);
		ClientUpdateRequest request = new ClientUpdateRequest(
			null, null, null, null, null, null, null, null, null, null, null, null
		);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		clientService.updateClient(user, "clt_12", request, "Bearer x", "req-1");

		verify(clientAuditLogger, never()).logAuditEvent(any(), any(), any(), any(), any(), any(), any(), any());
	}

	@Test
	void updateClient_sameValuesSubmitted_skipsAuditLogging() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientPayload payload = samplePayload();
		ClientEntity existing = entityFromPayload(12L, "usr_1", payload);
		ClientUpdateRequest request = new ClientUpdateRequest(
			payload.firstName(), payload.lastName(), null, null, null, null, null, null, null, null, null, null
		);
		when(clientRepository.findById(12L)).thenReturn(Optional.of(existing));
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		clientService.updateClient(user, "clt_12", request, "Bearer x", "req-1");

		verify(clientAuditLogger, never()).logAuditEvent(any(), any(), any(), any(), any(), any(), any(), any());
	}

	@Test
	void reviewVerification_nonAdminOrAgent_throwsAccessDenied() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "auditor");

		assertThatThrownBy(() ->
			clientService.reviewVerification(
				user,
				"clt_7",
				new ReviewVerificationRequest(ReviewVerificationRequest.ReviewAction.approve),
				"Bearer x",
				"req-1"
			)
		).isInstanceOf(AccessDeniedException.class);
	}

	@Test
	void reviewVerification_userRoleAllowedOnOwnedPendingClient() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientEntity entity = entityFromPayload(7L, "usr_1", samplePayload());
		entity.setIdentityVerificationStatus(IdentityVerificationStatus.pending);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		var response = clientService.reviewVerification(
			user,
			"clt_7",
			new ReviewVerificationRequest(ReviewVerificationRequest.ReviewAction.approve),
			"Bearer x",
			"req-1"
		);

		assertThat(response.identityVerificationStatus()).isEqualTo(IdentityVerificationStatus.verified);
		verify(clientAuditLogger).logAuditEvent(
			eq("UPDATE"),
			eq("identityVerificationStatus"),
			eq("pending"),
			eq("verified"),
			eq("usr_1"),
			eq("clt_7"),
			eq("req-1"),
			eq("Bearer x")
		);
	}

	@Test
	void reassignClients_adminLogsAuditAsUpdate() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		ClientEntity c1 = entityFromPayload(7L, "usr_from", samplePayload());
		ClientEntity c2 = entityFromPayload(8L, "usr_from", samplePayload());
		when(clientRepository.findByAssignedAgentId("usr_from")).thenReturn(List.of(c1, c2));
		when(clientRepository.reassignClients("usr_from", "usr_to")).thenReturn(2);

		var response = clientService.reassignClients(
			admin,
			new ReassignRequest("usr_from", "usr_to"),
			"Bearer x",
			"req-1"
		);

		assertThat(response.count()).isEqualTo(2);
		verify(clientAuditLogger).logAuditEvent(
			eq("UPDATE"),
			eq("assignedUserId"),
			eq("usr_from"),
			eq("usr_to"),
			eq("usr_1"),
			eq("clt_7"),
			eq("req-1"),
			eq("Bearer x")
		);
		verify(clientAuditLogger).logAuditEvent(
			eq("UPDATE"),
			eq("assignedUserId"),
			eq("usr_from"),
			eq("usr_to"),
			eq("usr_1"),
			eq("clt_8"),
			eq("req-1"),
			eq("Bearer x")
		);
	}

	@Test
	void reviewVerification_nonPending_throwsConflict() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		ClientEntity entity = entityFromPayload(7L, "usr_1", samplePayload());
		entity.setIdentityVerificationStatus(IdentityVerificationStatus.verified);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));

		assertThatThrownBy(() ->
			clientService.reviewVerification(
				admin,
				"clt_7",
				new ReviewVerificationRequest(ReviewVerificationRequest.ReviewAction.reject),
				"Bearer x",
				"req-1"
			)
		).isInstanceOf(IllegalStateException.class);
	}

	@Test
	void reviewVerification_pendingApprove_setsVerifiedAndAudits() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		ClientEntity entity = entityFromPayload(7L, "usr_1", samplePayload());
		entity.setIdentityVerificationStatus(IdentityVerificationStatus.pending);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		var response = clientService.reviewVerification(
			admin,
			"clt_7",
			new ReviewVerificationRequest(ReviewVerificationRequest.ReviewAction.approve),
			"Bearer x",
			"req-1"
		);

		assertThat(response.identityVerificationStatus()).isEqualTo(IdentityVerificationStatus.verified);
		verify(clientAuditLogger).logAuditEvent(
			eq("UPDATE"),
			eq("identityVerificationStatus"),
			eq("pending"),
			eq("verified"),
			eq("usr_1"),
			eq("clt_7"),
			eq("req-1"),
			eq("Bearer x")
		);
	}

	@Test
	void resendVerificationLink_nonVerified_publishesEmailAndReturnsCurrentStatus() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientEntity entity = entityFromPayload(7L, "usr_1", samplePayload());
		entity.setIdentityVerificationStatus(IdentityVerificationStatus.rejected);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));
		when(verificationTokenService.generateVerificationToken("clt_7", DEFAULT_VERIFICATION_LINK_TTL_SECONDS))
			.thenReturn("signed-token-abc");

		var response = clientService.resendVerificationLink(user, "clt_7", "Bearer x", "req-1");

		assertThat(response.clientId()).isEqualTo("clt_7");
		assertThat(response.identityVerificationStatus()).isEqualTo(IdentityVerificationStatus.rejected);
		verify(snsEmailPublisherService).publishVerificationEmail(
			eq("clt_7"),
			eq(entity.getEmailAddress()),
			eq("signed-token-abc"),
			eq(entity.getFirstName()),
			eq("req-1"),
			eq(DEFAULT_VERIFICATION_LINK_TTL_SECONDS)
		);
	}

	@Test
	void resendVerificationLink_verified_throwsConflictAndSkipsPublish() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientEntity entity = entityFromPayload(7L, "usr_1", samplePayload());
		entity.setIdentityVerificationStatus(IdentityVerificationStatus.verified);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));

		assertThatThrownBy(() -> clientService.resendVerificationLink(user, "clt_7", "Bearer x", "req-1"))
			.isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("not allowed");

		verify(verificationTokenService, never()).generateVerificationToken(any(), anyLong());
		verify(snsEmailPublisherService, never()).publishVerificationEmail(any(), any(), any(), any(), any(), anyLong());
	}

	// Upload Verification Documents
	@Test
	void uploadVerificationDocs_tokenValid_uploadsBothDocumentsToS3() {
		ClientEntity entity = entityFromPayload(7L, "usr_1", samplePayload());
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));
		when(verificationTokenService.consumeIfValid("clt_7", "valid-token-abc")).thenReturn(true);
		when(documentStorageService.upload(eq("clt_7"), eq("primary"), any(), any(), any()))
			.thenReturn("clients/clt_7/primary/nric_front.jpg");
		when(documentStorageService.upload(eq("clt_7"), eq("address"), any(), any(), any()))
			.thenReturn("clients/clt_7/address/bill.pdf");
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		clientService.uploadVerificationDocs("clt_7", validUploadRequest("valid-token-abc"), "req-1");

		verify(documentStorageService).upload(
			"clt_7", "primary", "nric_front.jpg", "base64PrimaryData==", "image/jpeg"
		);
		verify(documentStorageService).upload(
			"clt_7", "address", "bill.pdf", "base64AddressData==", "application/pdf"
		);
	}

	@Test
	void uploadVerificationDocs_tokenValid_persistsS3KeysAndSetsPending() {
		ClientEntity entity = entityFromPayload(7L, "usr_1", samplePayload());
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));
		when(verificationTokenService.consumeIfValid("clt_7", "valid-token-abc")).thenReturn(true);
		when(documentStorageService.upload(eq("clt_7"), eq("primary"), any(), any(), any()))
			.thenReturn("clients/clt_7/primary/nric_front.jpg");
		when(documentStorageService.upload(eq("clt_7"), eq("address"), any(), any(), any()))
			.thenReturn("clients/clt_7/address/bill.pdf");

		ArgumentCaptor<ClientEntity> captor = ArgumentCaptor.forClass(ClientEntity.class);
		when(clientRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

		clientService.uploadVerificationDocs("clt_7", validUploadRequest("valid-token-abc"), "req-1");

		ClientEntity saved = captor.getValue();
		assertThat(saved.getIdentityVerificationStatus()).isEqualTo(IdentityVerificationStatus.pending);
		assertThat(saved.getPrimaryDocumentType()).isEqualTo("NRIC");
		assertThat(saved.getPrimaryDocumentRef()).isEqualTo("clients/clt_7/primary/nric_front.jpg");
		assertThat(saved.getAddressDocumentType()).isEqualTo("UTILITY_BILL");
		assertThat(saved.getAddressDocumentRef()).isEqualTo("clients/clt_7/address/bill.pdf");
		assertThat(saved.getVerificationVerifiedAt()).isNull();
	}

	@Test
	void uploadVerificationDocs_tokenValid_returnsClientIdAndPendingStatus() {
		ClientEntity entity = entityFromPayload(7L, "usr_1", samplePayload());
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));
		when(verificationTokenService.consumeIfValid("clt_7", "valid-token-abc")).thenReturn(true);
		when(documentStorageService.upload(any(), any(), any(), any(), any())).thenReturn("s3-key");
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		var response = clientService.uploadVerificationDocs(
			"clt_7", validUploadRequest("valid-token-abc"), "req-1"
		);

		assertThat(response.clientId()).isEqualTo("clt_7");
		assertThat(response.identityVerificationStatus()).isEqualTo(IdentityVerificationStatus.pending);
	}

	@Test
	void uploadVerificationDocs_pendingStatus_allowsReplacementAndStaysPending() {
		ClientEntity entity = entityFromPayload(7L, "usr_1", samplePayload());
		entity.setIdentityVerificationStatus(IdentityVerificationStatus.pending);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));
		when(verificationTokenService.consumeIfValid("clt_7", "valid-token-abc")).thenReturn(true);
		when(documentStorageService.upload(eq("clt_7"), eq("primary"), any(), any(), any()))
			.thenReturn("clients/clt_7/primary/nric_front.jpg");
		when(documentStorageService.upload(eq("clt_7"), eq("address"), any(), any(), any()))
			.thenReturn("clients/clt_7/address/bill.pdf");
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		var response = clientService.uploadVerificationDocs("clt_7", validUploadRequest("valid-token-abc"), "req-1");

		assertThat(response.identityVerificationStatus()).isEqualTo(IdentityVerificationStatus.pending);
		verify(documentStorageService).upload(
			"clt_7", "primary", "nric_front.jpg", "base64PrimaryData==", "image/jpeg"
		);
		verify(documentStorageService).upload(
			"clt_7", "address", "bill.pdf", "base64AddressData==", "application/pdf"
		);
		verify(clientRepository).save(any());
	}

	@Test
	void uploadVerificationDocs_reviewedStatus_throwsConflictAndSkipsUpload() {
		ClientEntity entity = entityFromPayload(7L, "usr_1", samplePayload());
		entity.setIdentityVerificationStatus(IdentityVerificationStatus.verified);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));

		assertThatThrownBy(() ->
			clientService.uploadVerificationDocs("clt_7", validUploadRequest("valid-token-abc"), "req-1")
		)
			.isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("not allowed");

		verify(documentStorageService, never()).upload(any(), any(), any(), any(), any());
		verify(clientRepository, never()).save(any());
	}

	@Test
	void uploadVerificationDocs_rejectedStatus_allowsReplacementAndStaysPending() {
		ClientEntity entity = entityFromPayload(7L, "usr_1", samplePayload());
		entity.setIdentityVerificationStatus(IdentityVerificationStatus.rejected);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));
		when(verificationTokenService.consumeIfValid("clt_7", "valid-token-abc")).thenReturn(true);
		when(documentStorageService.upload(eq("clt_7"), eq("primary"), any(), any(), any()))
			.thenReturn("clients/clt_7/primary/nric_front.jpg");
		when(documentStorageService.upload(eq("clt_7"), eq("address"), any(), any(), any()))
			.thenReturn("clients/clt_7/address/bill.pdf");
		when(clientRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		var response = clientService.uploadVerificationDocs("clt_7", validUploadRequest("valid-token-abc"), "req-1");

		assertThat(response.identityVerificationStatus()).isEqualTo(IdentityVerificationStatus.pending);
		verify(documentStorageService).upload(
			"clt_7", "primary", "nric_front.jpg", "base64PrimaryData==", "image/jpeg"
		);
		verify(documentStorageService).upload(
			"clt_7", "address", "bill.pdf", "base64AddressData==", "application/pdf"
		);
		verify(clientRepository).save(any());
	}

	@Test
	void uploadVerificationDocs_tokenInvalid_throwsUnauthorizedException() {
		ClientEntity entity = entityFromPayload(7L, "usr_1", samplePayload());
		entity.setIdentityVerificationStatus(IdentityVerificationStatus.pending);
		when(clientRepository.findById(7L)).thenReturn(Optional.of(entity));
		when(verificationTokenService.consumeIfValid("clt_7", "bad-token")).thenReturn(false);

		assertThatThrownBy(() ->
			clientService.uploadVerificationDocs("clt_7", validUploadRequest("bad-token"), "req-1")
		).isInstanceOf(UnauthorizedException.class);

		verify(documentStorageService, never()).upload(any(), any(), any(), any(), any());
		verify(clientRepository, never()).save(any());
	}
}
