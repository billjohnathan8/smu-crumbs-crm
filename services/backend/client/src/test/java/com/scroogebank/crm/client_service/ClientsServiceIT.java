package com.scroogebank.crm.client_service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.scroogebank.crm.client_service.service.VerificationTokenService;
import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.HttpStatusCodeException;
import org.mockito.ArgumentCaptor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectResponse;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.PublishRequest;
import software.amazon.awssdk.services.sns.model.PublishResponse;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Integration tests for canonical client verification workflows.
 *
 * <p>These tests run against a real Spring app + Postgres container.
 * External AWS edges (SNS/S3) are mocked at the SDK client boundary so the
 * assertions stay deterministic while still covering service/controller wiring.</p>
 */
@Testcontainers
@Tag("integration")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClientsServiceIT {

	@LocalServerPort
	int port;

	private final RestTemplate restTemplate = new RestTemplate();
	private final HttpClient httpClient = HttpClient.newHttpClient();

	@Autowired
	private ObjectMapper objectMapper;

	@Autowired
	private VerificationTokenService verificationTokenService;

	@MockitoBean
	private SnsClient snsClient;

	@MockitoBean
	private S3Client s3Client;

	@Container
	@SuppressWarnings("resource")
	static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
		.withDatabaseName("clients")
		.withUsername("postgres")
		.withPassword("postgres");

	@DynamicPropertySource
	static void configureDatasource(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", postgres::getJdbcUrl);
		registry.add("spring.datasource.username", postgres::getUsername);
		registry.add("spring.datasource.password", postgres::getPassword);
		registry.add("app.jwt.hmac-secret", () -> "dev-only-insecure-secret");
		registry.add("app.verification.sns-topic-arn", () -> "arn:aws:sns:ap-southeast-1:000000000000:verification-it");
		registry.add("app.verification.documents-bucket", () -> "verification-it-bucket");
	}

	private String baseUrl() {
		return "http://localhost:" + port;
	}

	private static String mintToken(String sub, String role) throws Exception {
		String secret = "dev-only-insecure-secret";
		String headerJson = new ObjectMapper().writeValueAsString(Map.of("alg", "HS256", "typ", "JWT"));
		String header = Base64.getUrlEncoder().withoutPadding().encodeToString(headerJson.getBytes(StandardCharsets.UTF_8));
		String payloadJson = new ObjectMapper().writeValueAsString(
			Map.of("sub", sub, "role", role, "iat", Instant.now().getEpochSecond(), "exp", Instant.now().plusSeconds(3600).getEpochSecond())
		);
		String payload = Base64.getUrlEncoder().withoutPadding().encodeToString(payloadJson.getBytes(StandardCharsets.UTF_8));
		String signingInput = header + "." + payload;
		Mac mac = Mac.getInstance("HmacSHA256");
		mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
		String sig = Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(signingInput.getBytes(StandardCharsets.US_ASCII)));
		return signingInput + "." + sig;
	}

	/**
	 * Resets and configures external AWS client stubs before each integration test.
	 */
	@BeforeEach
	void setUpAwsClientStubs() {
		reset(snsClient, s3Client);
		when(snsClient.publish(any(PublishRequest.class)))
			.thenReturn(PublishResponse.builder().messageId("msg-it-1").build());
		when(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
			.thenReturn(PutObjectResponse.builder().eTag("etag-it").build());
	}

	private String jsonHeadersToken(String token) {
		return "Bearer " + token;
	}

	private HttpHeaders jsonHeaders(String authorizationHeader) {
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		if (authorizationHeader != null) {
			headers.set(HttpHeaders.AUTHORIZATION, authorizationHeader);
		}
		return headers;
	}

	private String createClientRequestBody(String firstName) {
		String uniqueEmail = "verify-it-" + UUID.randomUUID() + "@example.com";
		long phoneSuffix = ThreadLocalRandom.current().nextLong(1_000_000L, 10_000_000L);
		return createClientRequestBody(firstName, uniqueEmail, "+1555" + phoneSuffix);
	}

	private String createClientRequestBody(String firstName, String emailAddress, String phoneNumber) {
		return """
			{
			  "firstName": "%s",
			  "lastName": "Taylor",
			  "dateOfBirth": "1990-01-15",
			  "gender": "Male",
			  "emailAddress": "%s",
			  "phoneNumber": "%s",
			  "address": "123 Main Street",
			  "city": "Springfield",
			  "state": "Illinois",
			  "country": "United States",
			  "postalCode": "62704"
			}
			""".formatted(firstName, emailAddress, phoneNumber);
	}

	private String uploadVerificationRequestBody(String verificationToken) {
		return """
			{
			  "verificationToken": "%s",
			  "primaryDocumentType": "NRIC",
			  "primaryDocumentRef": "primary-id.jpg",
			  "primaryDocumentBase64": "/9j/ABEi",
			  "primaryDocumentMimeType": "image/jpeg",
			  "addressDocumentType": "UTILITY_BILL",
			  "addressDocumentRef": "proof-of-address.pdf",
			  "addressDocumentBase64": "JVBERi0xLjQgZmFrZS1wcm9vZi1vZi1hZGRyZXNz",
			  "addressDocumentMimeType": "application/pdf"
			}
			""".formatted(verificationToken);
	}

	private ResponseEntity<String> postJson(String path, String body, HttpHeaders headers) {
		try {
			return restTemplate.postForEntity(baseUrl() + path, new HttpEntity<>(body, headers), String.class);
		} catch (HttpStatusCodeException ex) {
			return ResponseEntity.status(ex.getStatusCode()).body(ex.getResponseBodyAsString());
		}
	}

	private ResponseEntity<String> getJson(String path, HttpHeaders headers) {
		try {
			return restTemplate.exchange(
				baseUrl() + path,
				HttpMethod.GET,
				new HttpEntity<>(headers),
				String.class
			);
		} catch (HttpStatusCodeException ex) {
			return ResponseEntity.status(ex.getStatusCode()).body(ex.getResponseBodyAsString());
		}
	}

	private JsonNode createClient(String authorizationHeader, String firstName) throws Exception {
		ResponseEntity<String> createResponse = postJson(
			"/api/clients",
			createClientRequestBody(firstName),
			jsonHeaders(authorizationHeader)
		);
		assertThat(createResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
		return objectMapper.readTree(createResponse.getBody());
	}

	private JsonNode uploadVerificationDocs(String clientId, String verificationToken) throws Exception {
		ResponseEntity<String> uploadResponse = postJson(
			"/api/clients/" + clientId + "/upload-verify",
			uploadVerificationRequestBody(verificationToken),
			jsonHeaders(null)
		);
		assertThat(uploadResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
		return objectMapper.readTree(uploadResponse.getBody());
	}

	private JsonNode getClient(String clientId, String authorizationHeader) throws Exception {
		ResponseEntity<String> getResponse = getJson(
			"/api/clients/" + clientId,
			jsonHeaders(authorizationHeader)
		);
		assertThat(getResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
		return objectMapper.readTree(getResponse.getBody());
	}

	private HttpResponse<String> reviewVerification(
		String clientId,
		String action,
		String authorizationHeader
	) throws Exception {
		String requestBody = """
			{
			  "action": "%s"
			}
			""".formatted(action);
		HttpRequest request = HttpRequest.newBuilder()
			.uri(URI.create(baseUrl() + "/api/clients/" + clientId + "/verify/review"))
			.header(HttpHeaders.AUTHORIZATION, authorizationHeader)
			.header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
			.method("PATCH", HttpRequest.BodyPublishers.ofString(requestBody))
			.build();
		return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
	}

	private static String requiredText(JsonNode payload, String fieldName) {
		JsonNode fieldNode = payload.get(fieldName);
		assertThat(fieldNode).as("Missing expected JSON field: %s", fieldName).isNotNull();
		String value = fieldNode.asString();
		assertThat(value).as("Expected JSON field '%s' to be a string value", fieldName).isNotNull();
		return value;
	}

	private String createPendingClient(String agentAuthorizationHeader) throws Exception {
		JsonNode created = createClient(agentAuthorizationHeader, "Pending");
		String clientId = requiredText(created, "clientId");
		String verificationToken = verificationTokenService.generateVerificationToken(clientId, 900);
		JsonNode uploadPayload = uploadVerificationDocs(clientId, verificationToken);
		assertThat(requiredText(uploadPayload, "identityVerificationStatus")).isEqualTo("pending");
		return clientId;
	}

	@Test
	void createClient_publishesVerificationEmailEvent() throws Exception {
		String agentAuth = jsonHeadersToken(mintToken("usr_it_agent", "user"));
		JsonNode created = createClient(agentAuth, "Jordan");
		String clientId = requiredText(created, "clientId");

		ArgumentCaptor<PublishRequest> publishCaptor = ArgumentCaptor.forClass(PublishRequest.class);
		verify(snsClient, times(1)).publish(publishCaptor.capture());
		PublishRequest publishRequest = publishCaptor.getValue();

		assertThat(publishRequest.topicArn()).isEqualTo("arn:aws:sns:ap-southeast-1:000000000000:verification-it");
		assertThat(publishRequest.subject()).isEqualTo("UPLOAD_VERIFICATION_REQUESTED");

		JsonNode event = objectMapper.readTree(publishRequest.message());
		assertThat(requiredText(event, "eventType")).isEqualTo("UPLOAD_VERIFICATION_REQUESTED");
		assertThat(requiredText(event, "clientId")).isEqualTo(clientId);
		assertThat(requiredText(event, "email")).isEqualTo(requiredText(created, "emailAddress"));
		assertThat(requiredText(event, "firstName")).isEqualTo("Jordan");
		assertThat(verificationTokenService.isValid(clientId, requiredText(event, "token"))).isTrue();
	}

	@Test
	void createClient_whenSnsPublishFails_stillCreatesClient_andRetryConflictsOnDuplicate() throws Exception {
		String agentAuth = jsonHeadersToken(mintToken("usr_it_agent", "user"));
		String email = "verify-it-" + UUID.randomUUID() + "@example.com";
		String phone = "+1555" + ThreadLocalRandom.current().nextLong(1_000_000L, 10_000_000L);
		String requestBody = createClientRequestBody("Retry", email, phone);

		when(snsClient.publish(any(PublishRequest.class))).thenThrow(new RuntimeException("sns down"));

		ResponseEntity<String> firstCreate = postJson(
			"/api/clients",
			requestBody,
			jsonHeaders(agentAuth)
		);

		assertThat(firstCreate.getStatusCode()).isEqualTo(HttpStatus.CREATED);
		JsonNode createdPayload = objectMapper.readTree(firstCreate.getBody());
		assertThat(requiredText(createdPayload, "emailAddress")).isEqualTo(email);

		when(snsClient.publish(any(PublishRequest.class)))
			.thenReturn(PublishResponse.builder().messageId("msg-it-recovered").build());

		ResponseEntity<String> retriedCreate = postJson(
			"/api/clients",
			requestBody,
			jsonHeaders(agentAuth)
		);

		assertThat(retriedCreate.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
		JsonNode conflictPayload = objectMapper.readTree(retriedCreate.getBody());
		assertThat(requiredText(conflictPayload, "error")).isEqualTo("conflict");
	}

	@Test
	void uploadVerificationDocs_publicTokenFlow_setsPendingStatus() throws Exception {
		String agentAuth = jsonHeadersToken(mintToken("usr_it_agent", "user"));
		JsonNode created = createClient(agentAuth, "Upload");
		String clientId = requiredText(created, "clientId");

		String verificationToken = verificationTokenService.generateVerificationToken(clientId, 900);
		JsonNode uploadPayload = uploadVerificationDocs(clientId, verificationToken);

		assertThat(requiredText(uploadPayload, "clientId")).isEqualTo(clientId);
		assertThat(requiredText(uploadPayload, "identityVerificationStatus")).isEqualTo("pending");
		verify(s3Client, times(2)).putObject(any(PutObjectRequest.class), any(RequestBody.class));

		JsonNode persisted = getClient(clientId, agentAuth);
		assertThat(requiredText(persisted, "identityVerificationStatus")).isEqualTo("pending");
		assertThat(requiredText(persisted, "primaryDocumentRef")).contains("clients/" + clientId + "/primary");
		assertThat(requiredText(persisted, "addressDocumentRef")).contains("clients/" + clientId + "/address");
	}

	@Test
	void uploadVerificationDocs_replayWhilePending_allowsReplacementAndStaysPending() throws Exception {
		String agentAuth = jsonHeadersToken(mintToken("usr_it_agent", "user"));
		JsonNode created = createClient(agentAuth, "ReplayPending");
		String clientId = requiredText(created, "clientId");

		String verificationToken = verificationTokenService.generateVerificationToken(clientId, 900);
		uploadVerificationDocs(clientId, verificationToken);
		String replayToken = verificationTokenService.generateVerificationToken(clientId, 900);
		JsonNode replayPayload = uploadVerificationDocs(clientId, replayToken);

		assertThat(requiredText(replayPayload, "identityVerificationStatus")).isEqualTo("pending");
		verify(s3Client, times(4)).putObject(any(PutObjectRequest.class), any(RequestBody.class));

		JsonNode persisted = getClient(clientId, agentAuth);
		assertThat(requiredText(persisted, "identityVerificationStatus")).isEqualTo("pending");
	}

	@Test
	void reviewVerification_pendingApprove_transitionsToVerified() throws Exception {
		String agentAuth = jsonHeadersToken(mintToken("usr_it_agent", "user"));
		String adminAuth = jsonHeadersToken(mintToken("usr_it_admin", "admin"));
		String clientId = createPendingClient(agentAuth);

		HttpResponse<String> reviewResponse = reviewVerification(clientId, "approve", adminAuth);
		assertThat(reviewResponse.statusCode()).isEqualTo(HttpStatus.OK.value());

		JsonNode reviewPayload = objectMapper.readTree(reviewResponse.body());
		assertThat(requiredText(reviewPayload, "clientId")).isEqualTo(clientId);
		assertThat(requiredText(reviewPayload, "identityVerificationStatus")).isEqualTo("verified");

		JsonNode persisted = getClient(clientId, adminAuth);
		assertThat(requiredText(persisted, "identityVerificationStatus")).isEqualTo("verified");
	}

	@Test
	void reviewVerification_pendingReject_transitionsToRejected() throws Exception {
		String agentAuth = jsonHeadersToken(mintToken("usr_it_agent", "user"));
		String adminAuth = jsonHeadersToken(mintToken("usr_it_admin", "admin"));
		String clientId = createPendingClient(agentAuth);

		HttpResponse<String> reviewResponse = reviewVerification(clientId, "reject", adminAuth);
		assertThat(reviewResponse.statusCode()).isEqualTo(HttpStatus.OK.value());

		JsonNode reviewPayload = objectMapper.readTree(reviewResponse.body());
		assertThat(requiredText(reviewPayload, "clientId")).isEqualTo(clientId);
		assertThat(requiredText(reviewPayload, "identityVerificationStatus")).isEqualTo("rejected");

		JsonNode persisted = getClient(clientId, adminAuth);
		assertThat(requiredText(persisted, "identityVerificationStatus")).isEqualTo("rejected");
	}

	@Test
	void uploadVerificationDocs_afterReviewDecision_returnsConflictAndDoesNotResetStatus() throws Exception {
		String agentAuth = jsonHeadersToken(mintToken("usr_it_agent", "user"));
		String adminAuth = jsonHeadersToken(mintToken("usr_it_admin", "admin"));
		JsonNode created = createClient(agentAuth, "ReplayAfterReview");
		String clientId = requiredText(created, "clientId");

		String verificationToken = verificationTokenService.generateVerificationToken(clientId, 900);
		uploadVerificationDocs(clientId, verificationToken);

		HttpResponse<String> approveResponse = reviewVerification(clientId, "approve", adminAuth);
		assertThat(approveResponse.statusCode()).isEqualTo(HttpStatus.OK.value());

		String replayToken = verificationTokenService.generateVerificationToken(clientId, 900);
		ResponseEntity<String> replayUpload = postJson(
			"/api/clients/" + clientId + "/upload-verify",
			uploadVerificationRequestBody(replayToken),
			jsonHeaders(null)
		);
		assertThat(replayUpload.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
		JsonNode conflictPayload = objectMapper.readTree(replayUpload.getBody());
		assertThat(requiredText(conflictPayload, "error")).isEqualTo("conflict");

		verify(s3Client, times(2)).putObject(any(PutObjectRequest.class), any(RequestBody.class));

		JsonNode persisted = getClient(clientId, adminAuth);
		assertThat(requiredText(persisted, "identityVerificationStatus")).isEqualTo("verified");
	}

	@Test
	void uploadVerificationDocs_malformedToken_returnsUnauthorized() throws Exception {
		String agentAuth = jsonHeadersToken(mintToken("usr_it_agent", "user"));
		JsonNode created = createClient(agentAuth, "Malformed");
		String clientId = requiredText(created, "clientId");

		ResponseEntity<String> uploadResponse = postJson(
			"/api/clients/" + clientId + "/upload-verify",
			uploadVerificationRequestBody("not-a-jwt"),
			jsonHeaders(null)
		);

		assertThat(uploadResponse.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
		verify(s3Client, never()).putObject(any(PutObjectRequest.class), any(RequestBody.class));

		JsonNode persisted = getClient(clientId, agentAuth);
		assertThat(requiredText(persisted, "identityVerificationStatus")).isEqualTo("unverified");
	}
}



