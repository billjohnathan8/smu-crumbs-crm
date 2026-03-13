package com.scroogebank.crm.client_service.controller;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.scroogebank.crm.client_service.api.Pagination;
import com.scroogebank.crm.client_service.dto.ClientCreateRequest;
import com.scroogebank.crm.client_service.dto.ClientDto;
import com.scroogebank.crm.client_service.dto.ClientListResponse;
import com.scroogebank.crm.client_service.dto.IdentityVerificationStatus;
import com.scroogebank.crm.client_service.entity.Gender;
import com.scroogebank.crm.client_service.exception.ApiExceptionHandler;
import com.scroogebank.crm.client_service.exception.ClientNotFoundException;
import com.scroogebank.crm.client_service.exception.DuplicateClientException;
import com.scroogebank.crm.client_service.security.AuthenticatedUser;
import com.scroogebank.crm.client_service.security.RequestAuth;
import com.scroogebank.crm.client_service.service.ClientService;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Web MVC tests for {@link ClientController}.
 */
class ClientControllerTest {
	private static final String AUTH_HEADER = "Bearer test";

	private MockMvc mockMvc;
	private ClientService clientService;
	private RequestAuth requestAuth;

	void setUp() {
		clientService = mock(ClientService.class);
		requestAuth = mock(RequestAuth.class);
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "agent"));
		mockMvc = MockMvcBuilders.standaloneSetup(new ClientController(clientService, requestAuth))
			.setControllerAdvice(new ApiExceptionHandler())
			.setMessageConverters(new JacksonJsonHttpMessageConverter(
				JsonMapper.builder()
					.findAndAddModules()
					.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, true)
					.build()
			))
			.build();
	}

	private ClientDto sampleDto(String id) {
		return new ClientDto(
			id,
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
			"62704",
			IdentityVerificationStatus.unverified,
			"usr_1",
			null,
			null,
			null,
			Instant.parse("2026-02-04T12:00:00Z"),
			Instant.parse("2026-02-04T12:00:00Z")
		);
	}

	private String createRequestJson() throws Exception {
		return """
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
	}

	private String updateRequestJson() throws Exception {
		return """
			{
			  "phoneNumber": "+15551234567"
			}
			""";
	}

	@Test
	void listClients_returnsPaginatedShape() throws Exception {
		setUp();
		when(clientService.listClients(any(), eq(50), eq(0), eq(null))).thenReturn(
			new ClientListResponse(List.of(sampleDto("clt_1")), new Pagination(50, 0, 1))
		);

		mockMvc.perform(get("/api/clients").header("Authorization", AUTH_HEADER))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.data[0].clientId").value("clt_1"))
			.andExpect(jsonPath("$.pagination.total").value(1));
	}

	@Test
	void createClient_returnsCreatedClient() throws Exception {
		setUp();
		when(clientService.createClient(any(), any(), any(), any())).thenReturn(sampleDto("clt_10"));

		mockMvc.perform(post("/api/clients")
				.header("Authorization", AUTH_HEADER)
				.contentType(MediaType.APPLICATION_JSON)
				.content(createRequestJson()))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.clientId").value("clt_10"));

		ArgumentCaptor<ClientCreateRequest> captor = ArgumentCaptor.forClass(ClientCreateRequest.class);
		verify(clientService).createClient(any(), captor.capture(), eq(AUTH_HEADER), any());
		assertThat(captor.getValue().firstName()).isEqualTo("Jordan");
	}

	@Test
	void createClient_duplicate_returnsConflict() throws Exception {
		setUp();
		when(clientService.createClient(any(), any(), any(), any()))
			.thenThrow(new DuplicateClientException("Email address already exists."));

		mockMvc.perform(post("/api/clients")
				.header("Authorization", AUTH_HEADER)
				.contentType(MediaType.APPLICATION_JSON)
				.content(createRequestJson()))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.error").value("conflict"));
	}

	@Test
	void createClient_unknownField_returnsBadRequest() throws Exception {
		setUp();
		String payloadWithUnknownField = """
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
			  "postalCode": "62704",
			  "unknownField": "unexpected"
			}
			""";

		mockMvc.perform(post("/api/clients")
				.header("Authorization", AUTH_HEADER)
				.contentType(MediaType.APPLICATION_JSON)
				.content(payloadWithUnknownField))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("validation_error"))
			.andExpect(jsonPath("$.message").value("Invalid request body"));
	}

	@Test
	void getClient_returnsClient() throws Exception {
		setUp();
		when(clientService.getClient(any(), eq("clt_7"), any(), any())).thenReturn(sampleDto("clt_7"));

		mockMvc.perform(get("/api/clients/clt_7").header("Authorization", AUTH_HEADER))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.clientId").value("clt_7"));
	}

	@Test
	void getClient_notFound_returns404() throws Exception {
		setUp();
		when(clientService.getClient(any(), eq("clt_404"), any(), any())).thenThrow(new ClientNotFoundException("clt_404"));

		mockMvc.perform(get("/api/clients/clt_404").header("Authorization", AUTH_HEADER))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.error").value("not_found"));
	}

	@Test
	void updateClient_returnsUpdatedClient() throws Exception {
		setUp();
		when(clientService.updateClient(any(), eq("clt_12"), any(), any(), any())).thenReturn(sampleDto("clt_12"));

		mockMvc.perform(put("/api/clients/clt_12")
				.header("Authorization", AUTH_HEADER)
				.contentType(MediaType.APPLICATION_JSON)
				.content(updateRequestJson()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.clientId").value("clt_12"));
	}

	@Test
	void deleteClient_returnsNoContent() throws Exception {
		setUp();
		doNothing().when(clientService).deleteClient(any(), eq("clt_55"), any(), any());

		mockMvc.perform(delete("/api/clients/clt_55").header("Authorization", AUTH_HEADER))
			.andExpect(status().isNoContent());
	}

	@Test
	void listClients_invalidLimitType_returnsBadRequest() throws Exception {
		setUp();
		mockMvc.perform(get("/api/clients?limit=abc").header("Authorization", AUTH_HEADER))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("validation_error"))
			.andExpect(jsonPath("$.message").value("Invalid request parameter: limit"));
	}
}
