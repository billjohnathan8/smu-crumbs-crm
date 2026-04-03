package com.scroogebank.crm.client_service.controller;

import com.scroogebank.crm.client_service.dto.ClientCreateRequest;
import com.scroogebank.crm.client_service.dto.ClientDto;
import com.scroogebank.crm.client_service.dto.ClientListResponse;
import com.scroogebank.crm.client_service.dto.ClientUpdateRequest;
import com.scroogebank.crm.client_service.dto.ReassignRequest;
import com.scroogebank.crm.client_service.dto.ReassignResponse;
import com.scroogebank.crm.client_service.dto.ReviewVerificationRequest;
import com.scroogebank.crm.client_service.dto.UploadVerificationDocsRequest;
import com.scroogebank.crm.client_service.dto.VerificationDocumentResponse;
import com.scroogebank.crm.client_service.dto.VerifyClientResponse;
import com.scroogebank.crm.client_service.security.AuthenticatedUser;
import com.scroogebank.crm.client_service.security.RequestAuth;
import com.scroogebank.crm.client_service.service.ClientService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for client lifecycle and verification operations.
 */
@RestController
@Validated
@RequestMapping("/api/clients")
@Tag(name = "Clients")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
	@ApiResponse(responseCode = "400", description = "Validation failed"),
	@ApiResponse(responseCode = "401", description = "Unauthorized"),
	@ApiResponse(responseCode = "403", description = "Forbidden"),
	@ApiResponse(responseCode = "404", description = "Not found"),
	@ApiResponse(responseCode = "500", description = "Internal error")
})
public class ClientController {
	private static final int MAX_UPLOAD_ATTEMPTS_PER_MINUTE = 8;
	private static final long UPLOAD_RATE_WINDOW_SECONDS = 60;
	private static final long IDEMPOTENCY_TTL_SECONDS = 300;

	private final ClientService clientService;
	private final RequestAuth requestAuth;
	private final ConcurrentMap<String, AttemptWindow> uploadAttemptsByClientAndIp = new ConcurrentHashMap<>();
	private final ConcurrentMap<String, Long> idempotencyKeysByClientAndKey = new ConcurrentHashMap<>();

	public ClientController(ClientService clientService, RequestAuth requestAuth) {
		this.clientService = clientService;
		this.requestAuth = requestAuth;
	}

	@GetMapping("/count")
	@Operation(summary = "Count clients assigned to a specific agent")
	public java.util.Map<String, Long> countClientsByAgent(
		HttpServletRequest httpRequest,
		@RequestParam String assignedUserId
	) {
		requestAuth.requireUser(httpRequest);
		long count = clientService.countClientsByAgent(assignedUserId);
		return java.util.Map.of("count", count);
	}

	/**
	 * Lists clients visible to the authenticated user with pagination and optional query filtering.
	 *
	 * @param request HTTP request used for auth
	 * @param limit page size (capped by service)
	 * @param offset pagination offset
	 * @param q optional search query
	 * @return list response with pagination metadata
	 */
	@GetMapping
	@Operation(summary = "List clients")
	public ClientListResponse listClients(
		HttpServletRequest request,
		@RequestParam(defaultValue = "50") int limit,
		@RequestParam(defaultValue = "0") int offset,
		@RequestParam(required = false) String q
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		return clientService.listClients(user, limit, offset, q);
	}

	/**
	 * Creates a new client and returns the created record.
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param request create payload
	 * @return created client DTO
	 */
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "Create client")
	public ClientDto createClient(
		HttpServletRequest httpRequest,
		@Valid @RequestBody ClientCreateRequest request
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		return clientService.createClient(user, request, authorizationHeader, requestId(httpRequest));
	}

	/**
	 * Fetches a single client and emits a read audit entry when possible.
	 *
	 * @param request HTTP request used for auth and correlation id extraction
	 * @param clientId public client identifier
	 * @return client DTO
	 */
	@GetMapping("/{id}")
	@Operation(summary = "Get client by id")
	public ClientDto getClient(HttpServletRequest request, @Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable("id") String clientId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		String authorizationHeader = request.getHeader("Authorization");
		return clientService.getClient(user, clientId, authorizationHeader, requestId(request));
	}

	/**
	 * Updates an existing client record.
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param clientId public client identifier
	 * @param request update payload (partial updates allowed)
	 * @return updated client DTO
	 */
	@PutMapping("/{id}")
	@Operation(summary = "Update client")
	public ClientDto updateClient(
		HttpServletRequest httpRequest,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable("id") String clientId,
		@Valid @RequestBody ClientUpdateRequest request
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		return clientService.updateClient(user, clientId, request, authorizationHeader, requestId(httpRequest));
	}

	/**
	 * Deletes a client record.
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param clientId public client identifier
	 */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Operation(summary = "Delete client")
	public void deleteClient(
		HttpServletRequest httpRequest,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable("id") String clientId
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		clientService.deleteClient(user, clientId, authorizationHeader, requestId(httpRequest));
	}

	/**
	 * Reassigns all clients from one agent to another (admin only).
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param request reassignment payload
	 * @return transfer count
	 */
	@PostMapping("/reassign")
	@Operation(summary = "Reassign clients between agents")
	public ReassignResponse reassignClients(
		HttpServletRequest httpRequest,
		@Valid @RequestBody ReassignRequest request
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		return clientService.reassignClients(user, request, authorizationHeader, requestId(httpRequest));
	}

	/**
	 * Client upload verification document
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param clientId public client identifier
	 * @param request verification payload
	 * @return verification response
	 */
	@PostMapping("/{id}/upload-verify")
	@Operation(
		summary = "Upload client verification documents with verification token",
		security = {}
	)
	@SecurityRequirements
	public VerifyClientResponse uploadVerificationDocs(
		HttpServletRequest httpRequest,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable("id") String clientId,
		@RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
		@Valid @RequestBody UploadVerificationDocsRequest request
	) {
		enforceUploadAbuseControls(httpRequest, clientId, idempotencyKey);
		return clientService.uploadVerificationDocs(clientId, request, requestId(httpRequest));
	}

	/**
	 * Reviews a pending verification request (admin only).
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param clientId public client identifier
	 * @param request review action payload
	 * @return verification response
	 */
	@PatchMapping("/{id}/verify/review")
	@Operation(summary = "Review client verification")
	public VerifyClientResponse reviewVerification(
		HttpServletRequest httpRequest,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable("id") String clientId,
		@Valid @RequestBody ReviewVerificationRequest request
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		return clientService.reviewVerification(user, clientId, request, authorizationHeader, requestId(httpRequest));
	}

	/**
	 * Re-sends verification link email to the client for a non-verified profile.
	 *
	 * @param request HTTP request used for auth and correlation id extraction
	 * @param clientId public client identifier
	 * @return current verification status
	 */
	@PostMapping("/{id}/verify/resend")
	@Operation(summary = "Resend client verification link")
	public VerifyClientResponse resendVerificationLink(
		HttpServletRequest request,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable("id") String clientId
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		String authorizationHeader = request.getHeader("Authorization");
		return clientService.resendVerificationLink(user, clientId, authorizationHeader, requestId(request));
	}

	/**
	 * Fetches an uploaded KYC document for client verification review.
	 *
	 * @param request HTTP request used for auth
	 * @param clientId public client identifier
	 * @param documentKind one of "primary" or "address"
	 * @return document payload including MIME type and base64 content
	 */
	@GetMapping("/{id}/verify/documents/{documentKind}")
	@Operation(summary = "Get uploaded verification document")
	public VerificationDocumentResponse getVerificationDocument(
		HttpServletRequest request,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable("id") String clientId,
		@Pattern(regexp = "^(primary|address)$") @PathVariable String documentKind
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		return clientService.getVerificationDocument(user, clientId, documentKind);
	}

	/**
	 * Pulls the request id from attributes to correlate downstream audit logs.
	 *
	 * @param request HTTP request
	 * @return request id or null when missing
	 */
	private static String requestId(HttpServletRequest request) {
		Object value = request.getAttribute("requestId");
		return value == null ? null : value.toString();
	}

	private void enforceUploadAbuseControls(HttpServletRequest request, String clientId, String idempotencyKey) {
		long now = Instant.now().getEpochSecond();
		evictExpired(now);

		String ip = requestClientIp(request);
		String rateKey = clientId + "|" + ip;
		AttemptWindow window = uploadAttemptsByClientAndIp.compute(rateKey, (_key, current) -> {
			if (current == null || now - current.windowStartEpochSeconds() >= UPLOAD_RATE_WINDOW_SECONDS) {
				return new AttemptWindow(now, 1);
			}
			return new AttemptWindow(current.windowStartEpochSeconds(), current.attemptCount() + 1);
		});
		if (window.attemptCount() > MAX_UPLOAD_ATTEMPTS_PER_MINUTE) {
			throw new IllegalStateException("Too many requests");
		}

		if (idempotencyKey == null || idempotencyKey.isBlank()) {
			return;
		}
		String trimmedKey = idempotencyKey.trim();
		if (trimmedKey.length() > 160) {
			throw new IllegalArgumentException("Invalid request");
		}
		String idempotencyMapKey = clientId + "|" + trimmedKey;
		Long previous = idempotencyKeysByClientAndKey.putIfAbsent(idempotencyMapKey, now + IDEMPOTENCY_TTL_SECONDS);
		if (previous != null) {
			throw new IllegalStateException("Duplicate submission");
		}
	}

	private void evictExpired(long nowEpochSeconds) {
		uploadAttemptsByClientAndIp.entrySet()
			.removeIf(entry -> nowEpochSeconds - entry.getValue().windowStartEpochSeconds() >= UPLOAD_RATE_WINDOW_SECONDS);
		idempotencyKeysByClientAndKey.entrySet()
			.removeIf(entry -> entry.getValue() <= nowEpochSeconds);
	}

	private static String requestClientIp(HttpServletRequest request) {
		String forwarded = request.getHeader("X-Forwarded-For");
		if (forwarded != null && !forwarded.isBlank()) {
			String[] parts = forwarded.split(",", 2);
			return parts[0].trim();
		}
		String direct = request.getRemoteAddr();
		return direct == null ? "unknown" : direct;
	}

	private record AttemptWindow(long windowStartEpochSeconds, int attemptCount) {}
}
