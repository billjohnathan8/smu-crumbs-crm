package com.scroogebank.crm.client_service.logging;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.client.RestClient;

/**
 * Configures the REST client used to reach the Lambda-backed log API.
 */
@Configuration
public class LogServiceClientConfig {
	/**
	 * Provides a Jackson ObjectMapper configured with JSR310 date/time module.
	 *
	 * @return ObjectMapper instance
	 */
	@Bean
	ObjectMapper logServiceObjectMapper() {
		ObjectMapper mapper = new ObjectMapper();
		mapper.registerModule(new JavaTimeModule());
		return mapper;
	}

	/**
	 * Builds a {@link RestClient} with the configured base URL.
	 * Uses SimpleClientHttpRequestFactory (HTTP/1.1) for compatibility with
	 * LocalStack/API Gateway style HTTP endpoints in local and CI flows.
	 *
	 * @param logServiceUrl base URL for the log API endpoint
	 * @param logServiceObjectMapper Jackson mapper with JSR-310 support
	 * @return RestClient instance
	 */
	@Bean
	RestClient logServiceRestClient(
		@Value("${app.log-service-url}") String logServiceUrl,
		ObjectMapper logServiceObjectMapper
	) {
		return RestClient.builder()
			.requestFactory(new SimpleClientHttpRequestFactory())
			.baseUrl(logServiceUrl)
			.messageConverters(converters -> {
				converters.removeIf(c -> c instanceof MappingJackson2HttpMessageConverter);
				converters.add(new MappingJackson2HttpMessageConverter(logServiceObjectMapper));
			})
			.build();
	}
}
