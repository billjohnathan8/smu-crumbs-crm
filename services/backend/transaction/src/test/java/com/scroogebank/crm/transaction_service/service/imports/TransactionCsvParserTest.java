package com.scroogebank.crm.transaction_service.service.imports;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.io.StringReader;
import org.junit.jupiter.api.Test;

/**
 * Verifies CSV parsing and validation behavior for transaction imports.
 */
class TransactionCsvParserTest {
	private final TransactionCsvParser parser = new TransactionCsvParser();

	@Test
	void parse_handlesQuotedFieldsAndHeader() throws IOException {
		TransactionCsvParser.ParseResult result = parser.parse(
			new StringReader("""
				clientId,transaction,amount,date,status
				"clt,001",D,1200.50,2026-02-01,Completed
				clt_2,W,100.00,2026-02-02,Pending
				"""),
			null
		);

		assertEquals(2, result.totalRecords());
		assertEquals(0, result.failedRecords());
		assertEquals(2, result.rows().size());
		assertEquals("clt,001", result.rows().get(0).clientId());
		assertEquals("D", result.rows().get(0).kind().wireValue());
	}

	@Test
	void parse_countsInvalidRowsAsFailed() throws IOException {
		TransactionCsvParser.ParseResult result = parser.parse(
			new StringReader("""
				clientId,transaction,amount,date,status
				clt_1,D,not-a-number,2026-02-01,Completed
				clt_2,X,100.00,2026-02-02,Completed
				clt_3,W,100.00,2026-02-03,Pending
				"""),
			null
		);

		assertEquals(3, result.totalRecords());
		assertEquals(2, result.failedRecords());
		assertEquals(1, result.rows().size());
		assertEquals("clt_3", result.rows().get(0).clientId());
	}

	@Test
	void parse_appliesClientFilterWithoutMarkingFailure() throws IOException {
		TransactionCsvParser.ParseResult result = parser.parse(
			new StringReader("""
				clientId,transaction,amount,date,status
				clt_1,D,100.00,2026-02-01,Completed
				clt_2,W,100.00,2026-02-02,Pending
				"""),
			"clt_1"
		);

		assertEquals(2, result.totalRecords());
		assertEquals(0, result.failedRecords());
		assertEquals(1, result.rows().size());
		assertEquals("clt_1", result.rows().get(0).clientId());
	}
}
