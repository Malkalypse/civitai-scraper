<?php

/** Workflow state normalization and description helpers.
 *
 * This class is the OOP entry point for workflow hash handling.
 */
class WorkflowStateManager {

	/** Describe workflow state from a stored workflow hash value.
	 * parametersPresent is derived from the 'P-' prefix on workflow_hash —
	 * no separate parameters_hash column is needed.
	 * @param mixed $workflowValue Workflow hash value read from the database
	 * @return array{hasWorkflowEntry: bool, workflowNull: bool, workflowHash: string, parametersPresent: bool}
	 */
	public static function describeWorkflowState( $workflowValue ): array {
		$normalizedWorkflowHash = self::normalizeWorkflowHashFromDb( $workflowValue );
		$workflowNull           = $normalizedWorkflowHash === null;
		$workflowHash           = is_string( $normalizedWorkflowHash ) ? $normalizedWorkflowHash : '';
		$parametersPresent      = str_starts_with( $workflowHash, 'P-' );
		$hasWorkflowEntry       = $workflowNull || $workflowHash !== '';

		return [
			'hasWorkflowEntry' => $hasWorkflowEntry,
			'workflowNull'     => $workflowNull,
			'workflowHash'     => $workflowHash,
			'parametersPresent'=> $parametersPresent,
		];
	}

	/** Normalize workflow hash value read from the database.
	 * Returns empty string for null/empty/invalid values, null for the -1 sentinel (confirmed missing).
	 * @param mixed $value Workflow hash value read from the database
	 * @return string|null Normalized workflow hash value
	 */
	public static function normalizeWorkflowHashFromDb( $value ): ?string {
		if( $value === null ) {
			return '';
		}

		$text = trim( ( string )$value );
		if( $text === '-1' ) {
			return null;
		}

		// Short purely-numeric values (e.g. "0") are invalid hashes written by an old
		// code bug and should be treated the same as an absent entry so the scanner
		// will re-process the image rather than treating it as already handled.
		if( $text !== '' && ctype_digit( $text ) ) {
			return '';
		}

		return $text;
	}

	/** Normalize workflow hash value for storage, using the -1 sentinel for missing workflow
	 * @param mixed $value Workflow hash value to normalize
	 * @return string Normalized workflow hash value for storage
	 */
	public static function normalizeWorkflowHashForStorage( $value ): string {
		if( $value === null ) {
			return '-1';
		}

		$text = trim( ( string )$value );
		if( $text === '' || $text === '-1' ) {
			return '-1';
		}

		return $text;
	}

}
