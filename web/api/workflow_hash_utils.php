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

		// Legacy/invalid hash values — treat as absent so the scanner re-processes the image.
		// 'P-1' is the old bare parameters marker (no real hash); purely-numeric values
		// (e.g. "0") were written by an earlier code bug.
		if( $text === 'P-1' || ( $text !== '' && ctype_digit( $text ) ) ) {
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
