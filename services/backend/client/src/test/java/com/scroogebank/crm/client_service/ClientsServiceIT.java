package com.scroogebank.crm.client_service;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.client.RestTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Integration tests against a real PostgreSQL database (Testcontainers).
 * Requires Docker to be running. Exclude by default in build; run with: ./gradlew test -PincludeIntegration=true
 */
@Testcontainers
@Tag("integration")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClientsServiceIT {

	@LocalServerPort
	int port;

	private final RestTemplate restTemplate = new RestTemplate();

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
	 * Verifies the full create-then-read flow: POST a new client, then GET by the returned id.
	 * Uses a real Postgres container, Flyway migrations, and the full Spring stack (controller, service, repository).
	 */
	@Test
	void createClient_thenGetById_returnsClient() throws Exception {
		String createBody = """
			{
			  "firstName": "Jordan",
			  "lastName": "Taylor",
			  "dateOfBirth": "1990-01-15",
			  "gender": "Male",
			  "emailAddress": "jordan.taylor@example.com",
			  "phoneNumber": "+15551234567",
			  "address": "123 Main Street",
			  "city": "Springfield",
			  "state": "Illinois",
			  "country": "United States",
			  "postalCode": "62704"
			}
			""";

		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + mintToken("usr_it_agent", "agent"));
		ResponseEntity<String> createResponse = restTemplate.postForEntity(
			baseUrl() + "/api/clients",
			new HttpEntity<>(createBody, headers),
			String.class
		);

		assertThat(createResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
		String createResponseBody = createResponse.getBody();
		assertThat(createResponseBody).isNotNull();
		ObjectMapper mapper = new ObjectMapper();
		JsonNode node = mapper.readTree(createResponseBody);
		String clientId = node.get("clientId").asString();
		assertThat(node.get("firstName").asString()).isEqualTo("Jordan");

		HttpHeaders getHeaders = new HttpHeaders();
		getHeaders.set(HttpHeaders.AUTHORIZATION, headers.getFirst(HttpHeaders.AUTHORIZATION));
		ResponseEntity<String> getResponse = restTemplate.exchange(
			baseUrl() + "/api/clients/" + clientId,
			org.springframework.http.HttpMethod.GET,
			new HttpEntity<>(getHeaders),
			String.class
		);

		assertThat(getResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(getResponse.getBody()).contains("\"clientId\":\"" + clientId + "\"");
		assertThat(getResponse.getBody()).contains("\"emailAddress\":\"jordan.taylor@example.com\"");
	}
}
