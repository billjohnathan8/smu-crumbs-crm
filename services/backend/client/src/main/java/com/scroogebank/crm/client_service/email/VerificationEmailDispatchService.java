package com.scroogebank.crm.client_service.email;

import com.scroogebank.crm.client_service.communication.CommunicationRecord;
import com.scroogebank.crm.client_service.communication.CommunicationStatus;
import com.scroogebank.crm.client_service.communication.CreateCommunicationRequest;
import com.scroogebank.crm.client_service.communication.LogServiceCommunicationClient;
import com.scroogebank.crm.client_service.communication.UpdateCommunicationStatusRequest;
import com.scroogebank.crm.client_service.config.AppProperties;
import com.scroogebank.crm.client_service.security.JwtService;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Coordinates communication queueing, immediate dispatch attempts, and retry updates.
 */
@Component
public class VerificationEmailDispatchService {
	private static final Logger LOGGER = LoggerFactory.getLogger(VerificationEmailDispatchService.class);
	private static final String EMAIL_CHANNEL = "email";

	private final LogServiceCommunicationClient communicationClient;
	private final VerificationEmailSender verificationEmailSender;
	private final AppProperties appProperties;
	private final JwtService jwtService;
	private final Clock clock;

	public VerificationEmailDispatchService(
		LogServiceCommunicationClient communicationClient,
		VerificationEmailSender verificationEmailSender,
		AppProperties appProperties,
		JwtService jwtService,
		Clock clock
	) {
		this.communicationClient = communicationClient;
		this.verificationEmailSender = verificationEmailSender;
		this.appProperties = appProperties;
		this.jwtService = jwtService;
		this.clock = clock;
	}

	/**
	 * Enqueues a verification email communication and performs an immediate dispatch attempt.
	 *
	 * @param clientId public client id
	 * @param agentId requesting agent id
	 * @param email rendered email payload
	 * @param authorizationHeader incoming authorization header
	 * @param requestId request id for logging
	 */
	public void queueAndDispatchVerificationEmail(
		String clientId,
		String agentId,
		VerificationEmail email,
		String authorizationHeader,
		String requestId
	) {
		String createAuthHeader = resolveAuthorizationHeader(authorizationHeader);
		String dispatchAuthHeader = buildServiceAuthorizationHeader();
		String idempotencyKey = "verification-email:" + clientId;

		CommunicationRecord communication = communicationClient.createCommunication(
			new CreateCommunicationRequest(
				clientId,
				agentId,
				email.toEmail(),
				email.subject(),
				email.body(),
				EMAIL_CHANNEL,
				idempotencyKey
			),
			createAuthHeader
		);
		dispatchCommunication(communication, dispatchAuthHeader, requestId);
	}

	/**
	 * Processes queued communications due for dispatch (scheduled worker path).
	 */
	public void processQueuedCommunications() {
		String authorizationHeader = buildServiceAuthorizationHeader();
		int maxBatchSize = appProperties.getVerificationEmail().getDispatch().getMaxBatchSize();
		for (CommunicationRecord communication : communicationClient.listQueuedCommunications(maxBatchSize, authorizationHeader)) {
			dispatchCommunication(communication, authorizationHeader, null);
		}
	}

	private void dispatchCommunication(
		CommunicationRecord communication,
		String authorizationHeader,
		String requestId
	) {
		if (communication == null) {
			return;
		}
		String channel = communication.channel();
		if (channel == null || !EMAIL_CHANNEL.equals(channel.toLowerCase(Locale.ROOT))) {
			return;
		}
		if (communication.status() == CommunicationStatus.sent) {
			return;
		}

		Integer retryCountValue = communication.retryCount();
		int currentRetryCount = retryCountValue == null ? 0 : retryCountValue;
		int maxAttempts = appProperties.getVerificationEmail().getDispatch().getMaxAttempts();
		if (communication.status() == CommunicationStatus.failed && currentRetryCount >= maxAttempts) {
			return;
		}

		Instant now = clock.instant();
		try {
			String providerMessageId = verificationEmailSender.send(
				new VerificationEmail(communication.toEmail(), communication.subject(), communication.body())
			);
			communicationClient.updateCommunicationStatus(
				communication.communicationId(),
				new UpdateCommunicationStatusRequest(
					CommunicationStatus.sent,
					providerMessageId,
					null,
					currentRetryCount,
					null,
					now,
					"SEND_ACCEPTED"
				),
				authorizationHeader
			);
			LOGGER.info(
				"Dispatched verification communication id={} providerMessageId={} requestId={}",
				communication.communicationId(),
				providerMessageId,
				requestId
			);
		}
		catch (Exception ex) {
			int nextRetryCount = currentRetryCount + 1;
			boolean exhausted = nextRetryCount >= maxAttempts;
			Instant nextAttemptAt = exhausted ? null : now.plusSeconds(backoffSeconds(nextRetryCount));
			communicationClient.updateCommunicationStatus(
				communication.communicationId(),
				new UpdateCommunicationStatusRequest(
					exhausted ? CommunicationStatus.failed : CommunicationStatus.queued,
					communication.providerMessageId(),
					truncate(ex.getMessage(), 1800),
					nextRetryCount,
					nextAttemptAt,
					now,
					exhausted ? "DISPATCH_FAILED_FINAL" : "DISPATCH_FAILED_RETRY"
				),
				authorizationHeader
			);
			LOGGER.warn(
				"Verification communication dispatch failed id={} retry={} exhausted={} requestId={}",
				communication.communicationId(),
				nextRetryCount,
				exhausted,
				requestId,
				ex
			);
		}
	}

	private long backoffSeconds(int retryCount) {
		long base = Math.max(1L, appProperties.getVerificationEmail().getDispatch().getBaseBackoffSeconds());
		int exponent = Math.max(0, Math.min(8, retryCount - 1));
		return base * (1L << exponent);
	}

	private String resolveAuthorizationHeader(String authorizationHeader) {
		return authorizationHeader == null || authorizationHeader.isBlank()
			? buildServiceAuthorizationHeader()
			: authorizationHeader;
	}

	private String buildServiceAuthorizationHeader() {
		AppProperties.Dispatch dispatch = appProperties.getVerificationEmail().getDispatch();
		String token = jwtService.mintForTests(
			dispatch.getServiceUserId(),
			"admin",
			clock.instant().plusSeconds(dispatch.getServiceTokenTtlSeconds())
		);
		return "Bearer " + token;
	}

	private static String truncate(String value, int limit) {
		if (value == null) {
			return null;
		}
		if (value.length() <= limit) {
			return value;
		}
		return value.substring(0, limit);
	}
}
