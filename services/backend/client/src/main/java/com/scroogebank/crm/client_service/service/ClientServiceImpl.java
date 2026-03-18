package com.scroogebank.crm.client_service.service;

import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.StringJoiner;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.scroogebank.crm.client_service.api.Pagination;
import com.scroogebank.crm.client_service.dto.ClientCreateRequest;
import com.scroogebank.crm.client_service.dto.ClientDto;
import com.scroogebank.crm.client_service.dto.ClientListResponse;
import com.scroogebank.crm.client_service.dto.ClientUpdateRequest;
import com.scroogebank.crm.client_service.dto.IdentityVerificationStatus;
import com.scroogebank.crm.client_service.dto.ReviewVerificationRequest;
import com.scroogebank.crm.client_service.dto.VerifyClientRequest;
import com.scroogebank.crm.client_service.dto.VerifyClientResponse;
import com.scroogebank.crm.client_service.email.VerificationEmail;
import com.scroogebank.crm.client_service.email.VerificationEmailDispatchService;
import com.scroogebank.crm.client_service.email.VerificationEmailTemplateRenderer;
import com.scroogebank.crm.client_service.entity.ClientEntity;
import com.scroogebank.crm.client_service.exception.ClientNotFoundException;
import com.scroogebank.crm.client_service.exception.DuplicateClientException;
import com.scroogebank.crm.client_service.logging.ClientAuditLogger;
import com.scroogebank.crm.client_service.logging.PiiMasker;
import com.scroogebank.crm.client_service.repository.ClientRepository;
import com.scroogebank.crm.client_service.security.AuthenticatedUser;
import com.scroogebank.crm.client_service.util.IdCodec;

/**
 * Default client service implementation with ownership checks and audit logging.
 */
@Service
public class ClientServiceImpl implements ClientService {
	private static final Logger LOGGER = LoggerFactory.getLogger(ClientServiceImpl.class);
	private static final String CLIENT_ID_PREFIX = "clt_";

	private final ClientRepository clientRepository;
	private final ClientAuditLogger clientAuditLogger;
	private final VerificationEmailTemplateRenderer verificationEmailTemplateRenderer;
	private final VerificationEmailDispatchService verificationEmailDispatchService;

	public ClientServiceImpl(
		ClientRepository clientRepository,
		ClientAuditLogger clientAuditLogger,
		VerificationEmailTemplateRenderer verificationEmailTemplateRenderer,
		VerificationEmailDispatchService verificationEmailDispatchService
	) {
		this.clientRepository = clientRepository;
		this.clientAuditLogger = clientAuditLogger;
		this.verificationEmailTemplateRenderer = verificationEmailTemplateRenderer;
		this.verificationEmailDispatchService = verificationEmailDispatchService;
	}

	/**
	 * Lists clients visible to the authenticated user with pagination and optional query filtering.
	 *
	 * @param user authenticated user
	 * @param limit requested limit (capped by service)
	 * @param offset requested offset
	 * @param q optional search query
	 * @return list response with pagination metadata
	 */
	@Override
	public ClientListResponse listClients(AuthenticatedUser user, int limit, int offset, String q) {
		int normalizedLimit = Math.max(1, Math.min(200, limit));
		int normalizedOffset = Math.max(0, offset);
		String query = q == null ? null : q.trim();

		List<ClientEntity> all = user.isAdmin()
			? clientRepository.searchAll(query)
			: clientRepository.searchByAgent(user.userId(), query);

		long total = all.size();
		int fromIndex = Math.min(normalizedOffset, all.size());
		int toIndex = Math.min(fromIndex + normalizedLimit, all.size());

		List<ClientDto> data = all.subList(fromIndex, toIndex).stream().map(this::toDto).toList();
		return new ClientListResponse(data, new Pagination(normalizedLimit, normalizedOffset, total));
	}

	/**
	 * Retrieves a client and emits a read audit entry when possible.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 * @return client DTO
	 */
	@Override
	public ClientDto getClient(
		AuthenticatedUser user,
		String clientId,
		String authorizationHeader,
		String requestId
	) {
		ClientEntity client = loadOwnedClient(user, clientId);
		publishAuditSafe(
			"READ",
			"Client ID",
			null,
			clientId(client.getId()),
			user.userId(),
			clientId(client.getId()),
			requestId,
			authorizationHeader
		);
		return toDto(client);
	}

	/**
	 * Creates a new client, assigns it to the requesting user, and logs an audit event.
	 *
	 * @param user authenticated user
	 * @param request create payload
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 * @return created client DTO
	 */
	@Override
	@Transactional
	public ClientDto createClient(
		AuthenticatedUser user,
		ClientCreateRequest request,
		String authorizationHeader,
		String requestId
	) {
		checkCreateConflicts(request.emailAddress(), request.phoneNumber());
		ClientEntity entity = new ClientEntity();
		applyCreate(entity, request);
		entity.setAssignedAgentId(user.userId());
		ClientEntity saved = clientRepository.save(entity);
		String apiClientId = clientId(saved.getId());
		publishAuditSafe(
			"CREATE",
			"Client ID",
			null,
			apiClientId,
			user.userId(),
			apiClientId,
			requestId,
			authorizationHeader
		);
		return toDto(saved);
	}

	/**
	 * Updates a client after ownership checks and conflict validation.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @param request update payload
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 * @return updated client DTO
	 */
	@Override
	@Transactional
	public ClientDto updateClient(
		AuthenticatedUser user,
		String clientId,
		ClientUpdateRequest request,
		String authorizationHeader,
		String requestId
	) {
		ClientEntity entity = loadOwnedClient(user, clientId);
		Long id = entity.getId();
		checkUpdateConflicts(id, request.emailAddress(), request.phoneNumber());

		StringJoiner attrs = new StringJoiner("|");
		StringJoiner befores = new StringJoiner("|");
		StringJoiner afters = new StringJoiner("|");
		collectChange(attrs, befores, afters, "firstName", entity.getFirstName(), request.firstName());
		collectChange(attrs, befores, afters, "lastName", entity.getLastName(), request.lastName());
		collectChange(attrs, befores, afters, "dateOfBirth",
			Objects.toString(entity.getDateOfBirth(), null),
			request.dateOfBirth() == null ? null : request.dateOfBirth().toString());
		collectChange(attrs, befores, afters, "gender",
			Objects.toString(entity.getGender(), null),
			request.gender() == null ? null : request.gender().name());
		collectChange(attrs, befores, afters, "emailAddress", entity.getEmailAddress(), request.emailAddress());
		collectChange(attrs, befores, afters, "phoneNumber", entity.getPhoneNumber(), request.phoneNumber());
		collectChange(attrs, befores, afters, "address", entity.getAddress(), request.address());
		collectChange(attrs, befores, afters, "city", entity.getCity(), request.city());
		collectChange(attrs, befores, afters, "state", entity.getState(), request.state());
		collectChange(attrs, befores, afters, "country", entity.getCountry(), request.country());
		collectChange(attrs, befores, afters, "postalCode", entity.getPostalCode(), request.postalCode());

		applyUpdate(entity, request);
		ClientEntity saved = clientRepository.save(entity);

		String attrString = attrs.toString();
		if (!attrString.isEmpty()) {
			publishAuditSafe(
				"UPDATE",
				attrString,
				befores.toString(),
				afters.toString(),
				user.userId(),
				clientId(saved.getId()),
				requestId,
				authorizationHeader
			);
		}
		return toDto(saved);
	}

	/**
	 * Records a field change into the attribute/before/after joiners when the new value differs.
	 */
	private void collectChange(
		StringJoiner attrs, StringJoiner befores, StringJoiner afters,
		String fieldName, String oldValue, String newValue
	) {
		if (newValue != null && !newValue.equals(oldValue)) {
			attrs.add(fieldName);
			befores.add(oldValue != null ? PiiMasker.mask(fieldName, oldValue) : "");
			afters.add(PiiMasker.mask(fieldName, newValue));
		}
	}

	/**
	 * Deletes a client and emits an audit event when possible.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 */
	@Override
	@Transactional
	public void deleteClient(AuthenticatedUser user, String clientId, String authorizationHeader, String requestId) {
		ClientEntity entity = loadOwnedClient(user, clientId);
		clientRepository.delete(entity);
		publishAuditSafe(
			"DELETE",
			"Client ID",
			clientId,
			null,
			user.userId(),
			clientId,
			requestId,
			authorizationHeader
		);
	}

	/**
	 * Marks a client as verified and logs the status change.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @param request verification payload
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 * @return verification response
	 */
	@Override
	@Transactional
	public VerifyClientResponse verifyClient(
		AuthenticatedUser user,
		String clientId,
		VerifyClientRequest request,
		String authorizationHeader,
		String requestId
	) {
		ClientEntity entity = loadOwnedClient(user, clientId);
		IdentityVerificationStatus before = entity.getIdentityVerificationStatus();

		// Persist document evidence so the verification event has a traceable audit trail.
		if (request.documentType() != null && !request.documentType().isBlank()) {
			entity.setVerificationDocumentType(request.documentType());
		}
		if (request.documentRef() != null && !request.documentRef().isBlank()) {
			entity.setVerificationDocumentRef(request.documentRef());
		}
		entity.setIdentityVerificationStatus(IdentityVerificationStatus.pending);
		entity.setVerificationVerifiedAt(null);
		ClientEntity saved = clientRepository.save(entity);

		publishAuditSafe(
			"UPDATE",
			"identityVerificationStatus",
			before == null ? null : before.name(),
			saved.getIdentityVerificationStatus().name(),
			user.userId(),
			clientId(saved.getId()),
			requestId,
			authorizationHeader
		);

		sendVerificationEmailSafe(
			saved,
			clientId(saved.getId()),
			user.userId(),
			authorizationHeader,
			requestId
		);

		return new VerifyClientResponse(clientId(saved.getId()), saved.getIdentityVerificationStatus());
	}

	@Override
	@Transactional
	public VerifyClientResponse reviewVerification(
		AuthenticatedUser user,
		String clientId,
		ReviewVerificationRequest request,
		String authorizationHeader,
		String requestId
	) {
		if (!user.isAdmin()) {
			throw new org.springframework.security.access.AccessDeniedException(
				"Only admins can review verifications"
			);
		}

		long id = decodeClientId(clientId);
		ClientEntity entity = clientRepository.findById(id)
			.orElseThrow(() -> new ClientNotFoundException("Client not found: " + clientId));

		if (entity.getIdentityVerificationStatus() != IdentityVerificationStatus.pending) {
			throw new IllegalStateException(
				"Client verification is not in pending state (current: "
				+ entity.getIdentityVerificationStatus() + ")"
			);
		}

		IdentityVerificationStatus before = entity.getIdentityVerificationStatus();
		IdentityVerificationStatus after = switch (request.action()) {
			case approve -> IdentityVerificationStatus.verified;
			case reject -> IdentityVerificationStatus.rejected;
		};

		entity.setIdentityVerificationStatus(after);
		if (after == IdentityVerificationStatus.verified) {
			entity.setVerificationVerifiedAt(java.time.Instant.now());
		}
		ClientEntity saved = clientRepository.save(entity);

		publishAuditSafe(
			"UPDATE",
			"identityVerificationStatus",
			before.name(),
			after.name(),
			user.userId(),
			clientId(saved.getId()),
			requestId,
			authorizationHeader
		);

		if (after == IdentityVerificationStatus.verified) {
			sendVerificationEmailSafe(
				saved,
				clientId(saved.getId()),
				user.userId(),
				authorizationHeader,
				requestId
			);
		}

		return new VerifyClientResponse(clientId(saved.getId()), saved.getIdentityVerificationStatus());
	}

	/**
	 * Validates that email and phone are unique for new clients.
	 *
	 * @param emailAddress email to check
	 * @param phoneNumber phone to check
	 */
	private void checkCreateConflicts(String emailAddress, String phoneNumber) {
		if (clientRepository.existsByEmailAddressIgnoreCase(emailAddress)) {
			throw new DuplicateClientException("Email address already exists.");
		}
		if (clientRepository.existsByPhoneNumber(phoneNumber)) {
			throw new DuplicateClientException("Phone number already exists.");
		}
	}

	/**
	 * Validates that updated email/phone do not conflict with other clients.
	 *
	 * @param id client database id
	 * @param emailAddress email to check
	 * @param phoneNumber phone to check
	 */
	private void checkUpdateConflicts(Long id, String emailAddress, String phoneNumber) {
		if (emailAddress == null && phoneNumber == null) {
			return;
		}
		if (emailAddress != null && clientRepository.existsByEmailAddressIgnoreCaseAndIdNot(emailAddress, id)) {
			throw new DuplicateClientException("Email address already exists.");
		}
		if (phoneNumber != null && clientRepository.existsByPhoneNumberAndIdNot(phoneNumber, id)) {
			throw new DuplicateClientException("Phone number already exists.");
		}
	}

	/**
	 * Applies create request fields to a new entity.
	 *
	 * @param entity client entity to populate
	 * @param request create payload
	 */
	private void applyCreate(ClientEntity entity, ClientCreateRequest request) {
		entity.setFirstName(request.firstName());
		entity.setLastName(request.lastName());
		entity.setDateOfBirth(request.dateOfBirth());
		entity.setGender(request.gender());
		entity.setEmailAddress(request.emailAddress().toLowerCase(Locale.ROOT));
		entity.setPhoneNumber(request.phoneNumber());
		entity.setAddress(request.address());
		entity.setCity(request.city());
		entity.setState(request.state());
		entity.setCountry(request.country());
		entity.setPostalCode(request.postalCode());
	}

	/**
	 * Applies update request fields to an existing entity.
	 *
	 * @param entity client entity to update
	 * @param request update payload
	 */
	private void applyUpdate(ClientEntity entity, ClientUpdateRequest request) {
		if (request.firstName() != null) {
			entity.setFirstName(request.firstName());
		}
		if (request.lastName() != null) {
			entity.setLastName(request.lastName());
		}
		if (request.dateOfBirth() != null) {
			entity.setDateOfBirth(request.dateOfBirth());
		}
		if (request.gender() != null) {
			entity.setGender(request.gender());
		}
		if (request.emailAddress() != null) {
			entity.setEmailAddress(request.emailAddress().toLowerCase(Locale.ROOT));
		}
		if (request.phoneNumber() != null) {
			entity.setPhoneNumber(request.phoneNumber());
		}
		if (request.address() != null) {
			entity.setAddress(request.address());
		}
		if (request.city() != null) {
			entity.setCity(request.city());
		}
		if (request.state() != null) {
			entity.setState(request.state());
		}
		if (request.country() != null) {
			entity.setCountry(request.country());
		}
		if (request.postalCode() != null) {
			entity.setPostalCode(request.postalCode());
		}
	}

	/**
	 * Maps a client entity to its API DTO.
	 *
	 * @param entity client entity
	 * @return client DTO
	 */
	private ClientDto toDto(ClientEntity entity) {
		return new ClientDto(
			clientId(entity.getId()),
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
			entity.getPostalCode(),
			entity.getIdentityVerificationStatus(),
			entity.getAssignedAgentId(),
			entity.getVerificationDocumentType(),
			entity.getVerificationDocumentRef(),
			entity.getVerificationVerifiedAt(),
			entity.getCreatedAt(),
			entity.getUpdatedAt()
		);
	}

	/**
	 * Loads a client and verifies ownership for the authenticated user.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @return owned client entity
	 * @throws ClientNotFoundException when the client does not exist or is not owned
	 */
	private ClientEntity loadOwnedClient(AuthenticatedUser user, String clientId) {
		long dbId = decodeClientId(clientId);
		ClientEntity client = clientRepository.findById(dbId)
			.orElseThrow(() -> new ClientNotFoundException(clientId));

		if (!user.isAdmin() && !user.userId().equals(client.getAssignedAgentId())) {
			throw new ClientNotFoundException(clientId);
		}
		return client;
	}

	/**
	 * Decodes an API client id to a database id.
	 *
	 * @param apiClientId public client identifier
	 * @return database id
	 */
	private long decodeClientId(String apiClientId) {
		return IdCodec.decode(CLIENT_ID_PREFIX, apiClientId);
	}

	/**
	 * Encodes a database client id into the public API format.
	 *
	 * @param dbId database id
	 * @return public client identifier
	 */
	private String clientId(long dbId) {
		return IdCodec.encode(CLIENT_ID_PREFIX, dbId);
	}

	/**
	 * Emits audit events when an authorization header is provided.
	 *
	 * @param action audit action
	 * @param attributeName attribute being changed or observed
	 * @param beforeValue previous value (nullable)
	 * @param afterValue new value (nullable)
	 * @param userId authenticated user id
	 * @param clientId associated client id
	 * @param correlationId request correlation id
	 * @param authorizationHeader bearer token for downstream auth
	 */
	private void publishAuditSafe(
		String action,
		String attributeName,
		String beforeValue,
		String afterValue,
		String userId,
		String clientId,
		String correlationId,
		String authorizationHeader
	) {
		if (authorizationHeader == null || authorizationHeader.isBlank()) {
			return;
		}
		try {
			clientAuditLogger.logAuditEvent(
				action,
				attributeName,
				beforeValue,
				afterValue,
				userId,
				clientId,
				correlationId,
				authorizationHeader
			);
		}
		catch (Exception ex) {
			LOGGER.warn("Client operation completed but audit logging failed. action={} clientId={}", action, clientId, ex);
		}
	}

	/**
	 * Sends verification confirmation email and keeps verification flow non-blocking.
	 *
	 * @param client verified client entity
	 * @param clientId public client identifier
	 * @param userId authenticated user id
	 * @param authorizationHeader inbound authorization header
	 * @param requestId request correlation id
	 */
	private void sendVerificationEmailSafe(
		ClientEntity client,
		String clientId,
		String userId,
		String authorizationHeader,
		String requestId
	) {
		try {
			VerificationEmail email = verificationEmailTemplateRenderer.render(
				client.getEmailAddress(),
				client.getFirstName(),
				clientId
			);
			verificationEmailDispatchService.queueAndDispatchVerificationEmail(
				clientId,
				userId,
				email,
				authorizationHeader,
				requestId
			);
			LOGGER.info(
				"Verification email dispatch triggered for clientId={} requestId={}",
				clientId,
				requestId
			);
		}
		catch (Exception ex) {
			LOGGER.warn(
				"Client verification completed but verification email failed. clientId={} requestId={}",
				clientId,
				requestId,
				ex
			);
		}
	}
}
