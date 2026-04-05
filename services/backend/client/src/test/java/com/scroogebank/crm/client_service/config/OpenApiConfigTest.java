package com.scroogebank.crm.client_service.config;

import static org.assertj.core.api.Assertions.assertThat;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.PathItem;
import io.swagger.v3.oas.models.Paths;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class OpenApiConfigTest {

	@Test
	void customizer_noPaths_noChanges() {
		OpenApiConfig config = new OpenApiConfig();
		OpenAPI openApi = new OpenAPI();

		config.publicVerificationUploadOperationCustomizer().customise(openApi);

		assertThat(openApi.getPaths()).isNull();
	}

	@Test
	void customizer_whenUploadPathPresent_postSecurityIsCleared() {
		OpenApiConfig config = new OpenApiConfig();
		OpenAPI openApi = new OpenAPI();
		Paths paths = new Paths();
		Operation post = new Operation();
		post.setSecurity(new ArrayList<>(List.of(new SecurityRequirement().addList("bearerAuth"))));
		paths.addPathItem("/api/clients/{id}/upload-verify", new PathItem().post(post));
		openApi.setPaths(paths);

		config.publicVerificationUploadOperationCustomizer().customise(openApi);

		assertThat(post.getSecurity()).isEmpty();
	}

	@Test
	void customizer_whenUploadPathMissing_noChanges() {
		OpenApiConfig config = new OpenApiConfig();
		OpenAPI openApi = new OpenAPI();
		openApi.setPaths(new Paths().addPathItem("/api/health", new PathItem().get(new Operation())));

		config.publicVerificationUploadOperationCustomizer().customise(openApi);

		assertThat(openApi.getPaths().get("/api/health").getGet()).isNotNull();
	}
}
