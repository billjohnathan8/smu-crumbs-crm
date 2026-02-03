package com.itsa.crm.clients_service;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

	/**
	 * Verifies the full create-then-read flow: POST a new client, then GET by the returned id.
	 * Uses a real Postgres container, Flyway migrations, and the full Spring stack (controller, service, repository).
	 */
	@Test
	void createClient_thenGetById_returnsClient() throws Exception {
		String createBody = """
			{
			  "client": {
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
			  },
			  "agentId": "agent-123"
			}
			""";

		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		ResponseEntity<String> createResponse = restTemplate.postForEntity(
			baseUrl() + "/api/v1/clients",
			new HttpEntity<>(createBody, headers),
			String.class
		);

		assertThat(createResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
		String createResponseBody = createResponse.getBody();
		assertThat(createResponseBody).isNotNull();
		ObjectMapper mapper = new ObjectMapper();
		JsonNode node = mapper.readTree(createResponseBody);
		long clientId = node.get("clientId").asLong();
		assertThat(node.get("firstName").asText()).isEqualTo("Jordan");

		ResponseEntity<String> getResponse = restTemplate.getForEntity(
			baseUrl() + "/api/v1/clients/" + clientId,
			String.class
		);

		assertThat(getResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(getResponse.getBody()).contains("\"clientId\":" + clientId);
		assertThat(getResponse.getBody()).contains("\"emailAddress\":\"jordan.taylor@example.com\"");
	}
}
