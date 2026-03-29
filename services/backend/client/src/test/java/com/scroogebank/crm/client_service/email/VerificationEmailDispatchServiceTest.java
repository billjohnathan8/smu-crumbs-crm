package com.scroogebank.crm.client_service.email;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.scroogebank.crm.client_service.communication.CommunicationRecord;
import com.scroogebank.crm.client_service.communication.CommunicationStatus;
import com.scroogebank.crm.client_service.communication.CreateCommunicationRequest;
import com.scroogebank.crm.client_service.communication.LogServiceCommunicationClient;
import com.scroogebank.crm.client_service.config.AppProperties;
import com.scroogebank.crm.client_service.security.JwtService;

/**
 * Unit tests for {@link VerificationEmailDispatchService}.
 */
class VerificationEmailDispatchServiceTest {
	private LogServiceCommunicationClient communicationClient;
	private VerificationEmailSender verificationEmailSender;
	private AppProperties appProperties;
	private JwtService jwtService;
	private Clock clock;
	private VerificationEmailDispatchService dispatchService;

	@BeforeEach
	public void setUp() {
		communicationClient = mock(LogServiceCommunicationClient.class);
		verificationEmailSender = mock(VerificationEmailSender.class);
		appProperties = new AppProperties();
		appProperties.getVerificationEmail().getDispatch().setMaxAttempts(3);
		appProperties.getVerificationEmail().getDispatch().setBaseBackoffSeconds(30);
		jwtService = mock(JwtService.class);
		clock = Clock.fixed(Instant.parse("2026-03-12T05:00:00Z"), ZoneOffset.UTC);
		when(jwtService.mintForTests(any(), eq("admin"), any())).thenReturn("svc-token");
		dispatchService = new VerificationEmailDispatchService(
			communicationClient,
			verificationEmailSender,
			appProperties,
			jwtService,
			clock
		);
	}

	@Test
	void queueAndDispatchVerificationEmail_successMarksSent() {
		CommunicationRecord queued = communication(
			"com_8",
			CommunicationStatus.queued,
			0,
			null
		);
		when(communicationClient.createCommunication(any(), eq("Bearer x"))).thenReturn(queued);
		when(verificationEmailSender.send(any())).thenReturn("ses-1");

		dispatchService.queueAndDispatchVerificationEmail(
			"clt_7",
			"usr_1",
			new VerificationEmail("to@example.com", "subject", "body"),
			"Bearer x",
			"req-1"
		);

		ArgumentCaptor<com.scroogebank.crm.client_service.communication.UpdateCommunicationStatusRequest> captor =
			ArgumentCaptor.forClass(com.scroogebank.crm.client_service.communication.UpdateCommunicationStatusRequest.class);
		verify(communicationClient).updateCommunicationStatus(eq("com_8"), captor.capture(), eq("Bearer svc-token"));
		assertThat(captor.getValue().status()).isEqualTo(CommunicationStatus.sent);
		assertThat(captor.getValue().providerMessageId()).isEqualTo("ses-1");
		assertThat(captor.getValue().deliveryEvent()).isEqualTo("SEND_ACCEPTED");
	}

	@Test
	void queueAndDispatchVerificationEmail_failureSchedulesRetry() {
		CommunicationRecord queued = communication(
			"com_8",
			CommunicationStatus.queued,
			0,
			null
		);
		when(communicationClient.createCommunication(any(), eq("Bearer x"))).thenReturn(queued);
		doThrow(new RuntimeException("ses down")).when(verificationEmailSender).send(any());

		dispatchService.queueAndDispatchVerificationEmail(
			"clt_7",
			"usr_1",
			new VerificationEmail("to@example.com", "subject", "body"),
			"Bearer x",
			"req-1"
		);

		ArgumentCaptor<com.scroogebank.crm.client_service.communication.UpdateCommunicationStatusRequest> captor =
			ArgumentCaptor.forClass(com.scroogebank.crm.client_service.communication.UpdateCommunicationStatusRequest.class);
		verify(communicationClient).updateCommunicationStatus(eq("com_8"), captor.capture(), eq("Bearer svc-token"));
		assertThat(captor.getValue().status()).isEqualTo(CommunicationStatus.queued);
		assertThat(captor.getValue().retryCount()).isEqualTo(1);
		assertThat(captor.getValue().nextAttemptAt()).isEqualTo(Instant.parse("2026-03-12T05:00:30Z"));
		assertThat(captor.getValue().deliveryEvent()).isEqualTo("DISPATCH_FAILED_RETRY");
	}

	@Test
	void queueAndDispatchVerificationEmail_failureAtMaxAttemptsMarksFailed() {
		CommunicationRecord queued = communication(
			"com_8",
			CommunicationStatus.queued,
			2,
			null
		);
		when(communicationClient.createCommunication(any(), eq("Bearer x"))).thenReturn(queued);
		doThrow(new RuntimeException("ses down")).when(verificationEmailSender).send(any());

		dispatchService.queueAndDispatchVerificationEmail(
			"clt_7",
			"usr_1",
			new VerificationEmail("to@example.com", "subject", "body"),
			"Bearer x",
			"req-1"
		);

		ArgumentCaptor<com.scroogebank.crm.client_service.communication.UpdateCommunicationStatusRequest> captor =
			ArgumentCaptor.forClass(com.scroogebank.crm.client_service.communication.UpdateCommunicationStatusRequest.class);
		verify(communicationClient).updateCommunicationStatus(eq("com_8"), captor.capture(), eq("Bearer svc-token"));
		assertThat(captor.getValue().status()).isEqualTo(CommunicationStatus.failed);
		assertThat(captor.getValue().retryCount()).isEqualTo(3);
		assertThat(captor.getValue().nextAttemptAt()).isNull();
		assertThat(captor.getValue().deliveryEvent()).isEqualTo("DISPATCH_FAILED_FINAL");
	}

	@Test
	void processQueuedCommunications_usesMintedServiceToken() {
		CommunicationRecord queued = communication(
			"com_10",
			CommunicationStatus.queued,
			0,
			null
		);
		when(communicationClient.listQueuedCommunications(eq(50), eq("Bearer svc-token"))).thenReturn(List.of(queued));
		when(verificationEmailSender.send(any())).thenReturn("ses-99");

		dispatchService.processQueuedCommunications();

		verify(communicationClient).listQueuedCommunications(eq(50), eq("Bearer svc-token"));
		verify(communicationClient).updateCommunicationStatus(eq("com_10"), any(), eq("Bearer svc-token"));
	}

	@Test
	void queueAndDispatchVerificationEmail_blankCallerAuth_usesServiceAuthAndVerificationIdempotencyKey() {
		CommunicationRecord queued = communication(
			"com_11",
			CommunicationStatus.queued,
			0,
			null
		);
		when(communicationClient.createCommunication(any(), eq("Bearer svc-token"))).thenReturn(queued);
		when(verificationEmailSender.send(any())).thenReturn("ses-200");

		dispatchService.queueAndDispatchVerificationEmail(
			"clt_7",
			"usr_1",
			new VerificationEmail("to@example.com", "subject", "body"),
			"   ",
			"req-2"
		);

		ArgumentCaptor<CreateCommunicationRequest> createCaptor = ArgumentCaptor.forClass(CreateCommunicationRequest.class);
		verify(communicationClient).createCommunication(createCaptor.capture(), eq("Bearer svc-token"));
		assertThat(createCaptor.getValue().clientId()).isEqualTo("clt_7");
		assertThat(createCaptor.getValue().userId()).isEqualTo("usr_1");
		assertThat(createCaptor.getValue().toEmail()).isEqualTo("to@example.com");
		assertThat(createCaptor.getValue().channel()).isEqualTo("email");
		assertThat(createCaptor.getValue().idempotencyKey()).isEqualTo("verification-email:clt_7");
		verify(communicationClient).updateCommunicationStatus(eq("com_11"), any(), eq("Bearer svc-token"));
	}

	private static CommunicationRecord communication(
		String communicationId,
		CommunicationStatus status,
		Integer retryCount,
		String providerMessageId
	) {
		Instant now = Instant.parse("2026-03-12T05:00:00Z");
		return new CommunicationRecord(
			communicationId,
			"clt_7",
			"usr_1",
			"email",
			"to@example.com",
			"subject",
			"body",
			status,
			providerMessageId,
			null,
			"verification-email:clt_7",
			retryCount,
			null,
			null,
			null,
			now,
			now
		);
	}
}
