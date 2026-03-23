package com.scroogebank.crm.client_service.controller;

import com.scroogebank.crm.client_service.api.Pagination;
import com.scroogebank.crm.client_service.dto.ClientDto;
import com.scroogebank.crm.client_service.dto.ClientListResponse;
import com.scroogebank.crm.client_service.dto.ClientCreateRequest;
import com.scroogebank.crm.client_service.dto.IdentityVerificationStatus;
import com.scroogebank.crm.client_service.dto.VerifyClientResponse;
import com.scroogebank.crm.client_service.entity.Gender;
import com.scroogebank.crm.client_service.exception.ApiExceptionHandler;
import com.scroogebank.crm.client_service.exception.ClientNotFoundException;
import com.scroogebank.crm.client_service.exception.DuplicateClientException;
import com.scroogebank.crm.client_service.security.AuthenticatedUser;
import com.scroogebank.crm.client_service.security.RequestAuth;
import com.scroogebank.crm.client_service.security.UnauthorizedException;
import com.scroogebank.crm.client_service.service.ClientService;
import java.time.Instant;
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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Web MVC tests for {@link ClientController}.
 */
class ClientControllerTest {
	private static final String AUTH_HEADER = "Bearer test";

	private MockMvc mockMvc;
	private ClientService clientService;
	private RequestAuth requestAuth;

	@BeforeEach
	void setUp() {
		clientService = mock(ClientService.class);
		requestAuth = mock(RequestAuth.class);
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "agent"));
		mockMvc = MockMvcBuilders.standaloneSetup(new ClientController(clientService, requestAuth))
			.setControllerAdvice(new ApiExceptionHandler())
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

	private String uploadVerificationDocsRequestJson(String token) throws Exception {
		return """
			{
				"primaryDocumentType": "NRIC",
				"primaryDocumentRef": "nric_front.jpg",
				"primaryDocumentBase64": "iVBORw0KGgoAAAANSUhEUgAAAAUA",
				"primaryDocumentMimeType": "image/jpeg",
				"addressDocumentType": "UTILITY_BILL",
				"addressDocumentRef": "sp_services_bill.pdf",
				"addressDocumentBase64": "JVBERi0xLjUKJcTl8uXrp",
				"addressDocumentMimeType": "application/pdf",
				"verificationToken": "%s"
				}
			""".formatted(token);
	}

	@Test
	void listClients_returnsPaginatedShape() throws Exception {
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
	void getClient_returnsClient() throws Exception {
		when(clientService.getClient(any(), eq("clt_7"), any(), any())).thenReturn(sampleDto("clt_7"));

		mockMvc.perform(get("/api/clients/clt_7").header("Authorization", AUTH_HEADER))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.clientId").value("clt_7"));
	}

	@Test
	void getClient_notFound_returns404() throws Exception {
		when(clientService.getClient(any(), eq("clt_404"), any(), any())).thenThrow(new ClientNotFoundException("clt_404"));

		mockMvc.perform(get("/api/clients/clt_404").header("Authorization", AUTH_HEADER))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.error").value("not_found"));
	}

	@Test
	void updateClient_returnsUpdatedClient() throws Exception {
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
		doNothing().when(clientService).deleteClient(any(), eq("clt_55"), any(), any());

		mockMvc.perform(delete("/api/clients/clt_55").header("Authorization", AUTH_HEADER))
			.andExpect(status().isNoContent());
	}

	// Client Upload Verification Documents
	@Test
	void uploadVerificationDocs_returnPendingStatus() throws Exception {
		when(clientService.uploadVerificationDocs(eq("clt_1"), any(), any()))
			.thenReturn(new VerifyClientResponse("clt_1", IdentityVerificationStatus.pending));

		mockMvc.perform(post("/api/clients/clt_1/upload-verify")
			.contentType(MediaType.APPLICATION_JSON)
			.content(uploadVerificationDocsRequestJson("valid-token")))
		.andExpect(status().isOk())
		.andExpect(jsonPath("$.clientId").value("clt_1"))
		.andExpect(jsonPath("$.identityVerificationStatus").value("pending"));
	}

	@Test
	void uploadVerificationDocs_returnUnauthorizedException() throws Exception {
		when(clientService.uploadVerificationDocs(any(), any(), any()))
			.thenThrow(new UnauthorizedException("Invalid or expired verification token"));

		mockMvc.perform(post("/api/clients/clt_1/upload-verify")
			.contentType(MediaType.APPLICATION_JSON)
			.content(uploadVerificationDocsRequestJson("bad-token")))
		.andExpect(status().isUnauthorized());
	}
}
