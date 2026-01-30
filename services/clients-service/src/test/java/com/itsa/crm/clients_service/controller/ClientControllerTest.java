package com.itsa.crm.clients_service.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.itsa.crm.clients_service.dto.ClientCreateRequest;
import com.itsa.crm.clients_service.dto.ClientDto;
import com.itsa.crm.clients_service.dto.ClientPayload;
import com.itsa.crm.clients_service.dto.ClientUpdateRequest;
import com.itsa.crm.clients_service.entity.Gender;
import com.itsa.crm.clients_service.exception.ApiExceptionHandler;
import com.itsa.crm.clients_service.exception.ClientNotFoundException;
import com.itsa.crm.clients_service.exception.DuplicateClientException;
import com.itsa.crm.clients_service.service.ClientService;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ClientControllerTest {
	private MockMvc mockMvc;
	private ObjectMapper objectMapper;
	private ClientService clientService;

	@BeforeEach
	void setUp() {
		clientService = mock(ClientService.class);
		objectMapper = new ObjectMapper();
		objectMapper.registerModule(new JavaTimeModule());
		mockMvc = MockMvcBuilders.standaloneSetup(new ClientController(clientService))
			.setControllerAdvice(new ApiExceptionHandler())
			.build();
	}

	// Test data helpers
	private ClientPayload samplePayload() {
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

	private ClientDto sampleDto(Long id) {
		ClientPayload payload = samplePayload();
		return new ClientDto(
			id,
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
	}

	private String createRequestJson() throws Exception {
		return objectMapper.writeValueAsString(new ClientCreateRequest(samplePayload(), "agent-123"));
	}

	private String updateRequestJson() throws Exception {
		return objectMapper.writeValueAsString(new ClientUpdateRequest(samplePayload(), "agent-456"));
	}

	// GET /api/v1/clients
	@Test
	void listClients_returnsDtos() throws Exception {
		when(clientService.listClients()).thenReturn(List.of(sampleDto(1L), sampleDto(2L)));

		mockMvc.perform(get("/api/v1/clients"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[0].clientId").value(1L))
			.andExpect(jsonPath("$[0].gender").value("Male"))
			.andExpect(jsonPath("$[1].clientId").value(2L));
	}

	// POST /api/v1/clients
	@Test
	void createClient_returnsCreatedDto() throws Exception {
		when(clientService.createClient(any())).thenReturn(sampleDto(10L));

		mockMvc.perform(post("/api/v1/clients")
				.contentType(MediaType.APPLICATION_JSON)
				.content(createRequestJson()))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.clientId").value(10L))
			.andExpect(jsonPath("$.emailAddress").value("jordan.taylor@example.com"));

		ArgumentCaptor<ClientCreateRequest> captor = ArgumentCaptor.forClass(ClientCreateRequest.class);
		verify(clientService).createClient(captor.capture());
		assertThat(captor.getValue().agentId()).isEqualTo("agent-123");
	}

	// POST /api/v1/clients - validation error
	@Test
	void createClient_missingClient_returnsBadRequest() throws Exception {
		mockMvc.perform(post("/api/v1/clients")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.client").exists());
	}

	// POST /api/v1/clients - duplicate conflict
	@Test
	void createClient_duplicate_returnsConflict() throws Exception {
		when(clientService.createClient(any()))
			.thenThrow(new DuplicateClientException("Duplicate email address"));

		mockMvc.perform(post("/api/v1/clients")
				.contentType(MediaType.APPLICATION_JSON)
				.content(createRequestJson()))
			.andExpect(status().isConflict())
			.andExpect(content().string("Duplicate email address"));
	}

	// GET /api/v1/clients/{id}
	@Test
	void getClient_returnsDto() throws Exception {
		when(clientService.getClient(7L)).thenReturn(sampleDto(7L));

		mockMvc.perform(get("/api/v1/clients/7"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.clientId").value(7L))
			.andExpect(jsonPath("$.firstName").value("Jordan"));
	}

	// GET /api/v1/clients/{id} - not found
	@Test
	void getClient_missing_returnsNotFound() throws Exception {
		when(clientService.getClient(404L))
			.thenThrow(new ClientNotFoundException(404L));

		mockMvc.perform(get("/api/v1/clients/404"))
			.andExpect(status().isNotFound())
			.andExpect(content().string("Client Id 404 not found"));
	}

	// PUT /api/v1/clients/{id}
	@Test
	void updateClient_returnsDto() throws Exception {
		when(clientService.updateClient(eq(12L), any())).thenReturn(sampleDto(12L));

		mockMvc.perform(put("/api/v1/clients/12")
				.contentType(MediaType.APPLICATION_JSON)
				.content(updateRequestJson()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.clientId").value(12L))
			.andExpect(jsonPath("$.phoneNumber").value("+15551234567"));
	}

	// PUT /api/v1/clients/{id} - validation error
	@Test
	void updateClient_missingClient_returnsBadRequest() throws Exception {
		mockMvc.perform(put("/api/v1/clients/12")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.client").exists());
	}

	// PUT /api/v1/clients/{id} - not found
	/** Verifies that PUT with a non-existent client id returns 404 and the ApiExceptionHandler message. */
	@Test
	void updateClient_notFound_returnsNotFound() throws Exception {
		when(clientService.updateClient(eq(999L), any()))
			.thenThrow(new ClientNotFoundException(999L));

		mockMvc.perform(put("/api/v1/clients/999")
				.contentType(MediaType.APPLICATION_JSON)
				.content(updateRequestJson()))
			.andExpect(status().isNotFound())
			.andExpect(content().string("Client Id 999 not found"));
	}

	// DELETE /api/v1/clients/{id}
	@Test
	void deleteClient_returnsNoContent() throws Exception {
		doNothing().when(clientService).deleteClient(eq(55L), any());

		mockMvc.perform(delete("/api/v1/clients/55"))
			.andExpect(status().isNoContent());

		verify(clientService).deleteClient(eq(55L), any());
	}

	// DELETE /api/v1/clients/{id} - not found
	/** Verifies that DELETE with a non-existent client id returns 404 and the ApiExceptionHandler message. */
	@Test
	void deleteClient_notFound_returnsNotFound() throws Exception {
		doThrow(new ClientNotFoundException(404L))
			.when(clientService).deleteClient(eq(404L), any());

		mockMvc.perform(delete("/api/v1/clients/404"))
			.andExpect(status().isNotFound())
			.andExpect(content().string("Client Id 404 not found"));
	}
}
