package com.scroogebank.crm.transaction_service.service.imports;

import com.scroogebank.crm.transaction_service.dto.TransactionKind;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.Reader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;

/**
 * Parser/validator for transaction CSV rows.
 */
@Component
public class TransactionCsvParser {
	private static final int EXPECTED_COLUMNS = 5;

	public ParseResult parse(Reader reader, String requestedClientId) throws IOException {
		List<ParsedTransactionRow> parsedRows = new ArrayList<>();
		int total = 0;
		int failed = 0;
		try (BufferedReader bufferedReader = new BufferedReader(reader)) {
			String line;
			boolean firstNonBlankLine = true;
			while ((line = bufferedReader.readLine()) != null) {
				String trimmed = line.trim();
				if (trimmed.isBlank()) {
					continue;
				}

				List<String> columns;
				try {
					columns = splitCsvLine(trimmed);
				}
				catch (IllegalArgumentException ex) {
					failed++;
					firstNonBlankLine = false;
					continue;
				}

				if (firstNonBlankLine && isHeader(columns)) {
					firstNonBlankLine = false;
					continue;
				}
				firstNonBlankLine = false;
				total++;

				try {
					ParsedTransactionRow row = parseRow(columns);
					if (requestedClientId == null || requestedClientId.isBlank() || requestedClientId.equals(row.clientId())) {
						parsedRows.add(row);
					}
				}
				catch (IllegalArgumentException ex) {
					failed++;
				}
			}
		}
		return new ParseResult(parsedRows, total, failed);
	}

	private static boolean isHeader(List<String> columns) {
		return columns.size() >= EXPECTED_COLUMNS
			&& "clientid".equalsIgnoreCase(columns.get(0).trim())
			&& "transaction".equalsIgnoreCase(columns.get(1).trim());
	}

	private static ParsedTransactionRow parseRow(List<String> columns) {
		if (columns.size() != EXPECTED_COLUMNS) {
			throw new IllegalArgumentException("invalid csv column count");
		}
		String clientId = columns.get(0).trim();
		if (clientId.isBlank()) {
			throw new IllegalArgumentException("client id is required");
		}

		TransactionKind kind = TransactionKind.fromWireValue(columns.get(1).trim());
		BigDecimal amount = new BigDecimal(columns.get(2).trim());
		if (amount.signum() < 0) {
			throw new IllegalArgumentException("negative amount not allowed");
		}
		LocalDate date = LocalDate.parse(columns.get(3).trim());
		TransactionStatus status = TransactionStatus.fromWireValue(columns.get(4).trim());
		String dedupeKey = dedupeKey(clientId, kind, amount, date, status);
		return new ParsedTransactionRow(clientId, kind, amount, date, status, dedupeKey);
	}

	private static String dedupeKey(
		String clientId,
		TransactionKind kind,
		BigDecimal amount,
		LocalDate date,
		TransactionStatus status
	) {
		String canonical = String.join(
			"|",
			clientId.trim(),
			kind.wireValue(),
			amount.stripTrailingZeros().toPlainString(),
			date.toString(),
			status.wireValue()
		);
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			byte[] bytes = digest.digest(canonical.getBytes(StandardCharsets.UTF_8));
			StringBuilder sb = new StringBuilder(bytes.length * 2);
			for (byte b : bytes) {
				sb.append(String.format(Locale.ROOT, "%02x", b));
			}
			return sb.toString();
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("missing SHA-256 algorithm", ex);
		}
	}

	private static List<String> splitCsvLine(String line) {
		List<String> columns = new ArrayList<>();
		StringBuilder current = new StringBuilder();
		boolean inQuotes = false;
		for (int i = 0; i < line.length(); i++) {
			char ch = line.charAt(i);
			if (ch == '"') {
				if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
					current.append('"');
					i++;
				}
				else {
					inQuotes = !inQuotes;
				}
				continue;
			}
			if (ch == ',' && !inQuotes) {
				columns.add(current.toString());
				current.setLength(0);
				continue;
			}
			current.append(ch);
		}
		if (inQuotes) {
			throw new IllegalArgumentException("unterminated quoted field");
		}
		columns.add(current.toString());
		return columns;
	}

	public record ParsedTransactionRow(
		String clientId,
		TransactionKind kind,
		BigDecimal amount,
		LocalDate date,
		TransactionStatus status,
		String dedupeKey
	) {}

	public record ParseResult(
		List<ParsedTransactionRow> rows,
		int totalRecords,
		int failedRecords
	) {}
}
