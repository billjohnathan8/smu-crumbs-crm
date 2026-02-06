package com.itsa.crm.transaction_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app")
public class AppProperties {

	private String clientServiceUrl;
	private Jwt jwt = new Jwt();
	private MockSftp mockSftp = new MockSftp();

	public String getClientServiceUrl() {
		return clientServiceUrl;
	}

	public void setClientServiceUrl(String clientServiceUrl) {
		this.clientServiceUrl = clientServiceUrl;
	}

	public Jwt getJwt() {
		return jwt;
	}

	public void setJwt(Jwt jwt) {
		this.jwt = jwt;
	}

	public MockSftp getMockSftp() {
		return mockSftp;
	}

	public void setMockSftp(MockSftp mockSftp) {
		this.mockSftp = mockSftp;
	}

	public static class Jwt {
		private String hmacSecret;

		public String getHmacSecret() {
			return hmacSecret;
		}

		public void setHmacSecret(String hmacSecret) {
			this.hmacSecret = hmacSecret;
		}
	}

	public static class MockSftp {
		private String root;

		public String getRoot() {
			return root;
		}

		public void setRoot(String root) {
			this.root = root;
		}
	}
}
