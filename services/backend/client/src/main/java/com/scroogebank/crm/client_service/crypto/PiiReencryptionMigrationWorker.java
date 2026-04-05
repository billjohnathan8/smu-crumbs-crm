package com.scroogebank.crm.client_service.crypto;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Release-1 migration worker that re-encrypts legacy/plaintext PII with the modern key.
 * Keeps processing in small batches so live traffic is not blocked.
 */
@Component
public class PiiReencryptionMigrationWorker {

	private static final Logger LOG = LoggerFactory.getLogger(PiiReencryptionMigrationWorker.class);

	private static final String SELECT_BATCH_SQL = """
		SELECT client_id, address, city, state, postal_code
		FROM clients
		WHERE client_id > ?
		ORDER BY client_id ASC
		LIMIT ?
		""";

	private static final String UPDATE_SQL = """
		UPDATE clients
		SET address = ?, city = ?, state = ?, postal_code = ?, updated_at = NOW()
		WHERE client_id = ?
		""";

	private final JdbcTemplate jdbcTemplate;
	private final boolean enabled;
	private final int batchSize;
	private final AtomicBoolean running = new AtomicBoolean(false);
	private volatile long lastProcessedId = 0L;
	private volatile boolean completed;

	public PiiReencryptionMigrationWorker(
		JdbcTemplate jdbcTemplate,
		@Value("${app.pii.migration.enabled:false}") boolean enabled,
		@Value("${app.pii.migration.batch-size:200}") int batchSize
	) {
		this.jdbcTemplate = jdbcTemplate;
		this.enabled = enabled;
		this.batchSize = Math.max(10, batchSize);
	}

	@Scheduled(initialDelayString = "${app.pii.migration.initial-delay-ms:20000}",
		fixedDelayString = "${app.pii.migration.poll-interval-ms:60000}")
	void migrateBatch() {
		if (!enabled || completed || !running.compareAndSet(false, true)) {
			return;
		}
		try {
			List<ClientPiiRow> rows = jdbcTemplate.query(
				SELECT_BATCH_SQL,
				this::mapRow,
				lastProcessedId,
				batchSize
			);
			if (rows.isEmpty()) {
				completed = true;
				LOG.info("PII re-encryption migration completed. lastProcessedId={}", lastProcessedId);
				return;
			}

			int updatedRows = 0;
			int unreadableRows = 0;
			for (ClientPiiRow row : rows) {
				lastProcessedId = row.clientId();

				EncryptedStringConverter.ReencryptionPlan addressPlan =
					EncryptedStringConverter.planModernReencryption(row.address());
				EncryptedStringConverter.ReencryptionPlan cityPlan =
					EncryptedStringConverter.planModernReencryption(row.city());
				EncryptedStringConverter.ReencryptionPlan statePlan =
					EncryptedStringConverter.planModernReencryption(row.state());
				EncryptedStringConverter.ReencryptionPlan postalPlan =
					EncryptedStringConverter.planModernReencryption(row.postalCode());

				boolean hasUnreadable = addressPlan.unreadable()
					|| cityPlan.unreadable()
					|| statePlan.unreadable()
					|| postalPlan.unreadable();
				if (hasUnreadable) {
					unreadableRows++;
					LOG.warn("Skipping row {} due to unreadable PII ciphertext", row.clientId());
					continue;
				}

				boolean rewrite = addressPlan.rewrite()
					|| cityPlan.rewrite()
					|| statePlan.rewrite()
					|| postalPlan.rewrite();
				if (!rewrite) {
					continue;
				}

				jdbcTemplate.update(
					UPDATE_SQL,
					addressPlan.value(),
					cityPlan.value(),
					statePlan.value(),
					postalPlan.value(),
					row.clientId()
				);
				updatedRows++;
			}

			LOG.info(
				"PII re-encryption batch processed: fetched={}, updated={}, unreadable={}, lastProcessedId={}",
				rows.size(), updatedRows, unreadableRows, lastProcessedId
			);
		}
		catch (RuntimeException ex) {
			LOG.error("PII re-encryption batch failed at lastProcessedId={}", lastProcessedId, ex);
		}
		finally {
			running.set(false);
		}
	}

	private ClientPiiRow mapRow(ResultSet rs, int rowNum) throws SQLException {
		return new ClientPiiRow(
			rs.getLong("client_id"),
			rs.getString("address"),
			rs.getString("city"),
			rs.getString("state"),
			rs.getString("postal_code")
		);
	}

	private record ClientPiiRow(
		long clientId,
		String address,
		String city,
		String state,
		String postalCode
	) {
	}
}
