<?php

/** Workflow state normalization and description helpers.
 *
 * This class is the OOP entry point for workflow hash handling.
 */
class WorkflowStateManager {

	/** Normalize parameters hash value for reads and writes
	 * @param mixed $value Parameters hash value to normalize
	 * @return string Normalized parameters hash value (empty string for null or non-string)
	 */
	public static function normalizeParametersHash( $value ): string {
		if( $value === null ) {
			return '';
		}

		return trim( ( string )$value );
	}

	/** Normalize workflow hash value read from the database
	 * - returns empty string for null or empty values, and null for the -1 sentinel value used for missing workflow
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

	/** Describe workflow state from stored workflow and parameters hash values
	 * @param mixed $workflowValue    Workflow hash value read from the database
	 * @param mixed $parametersValue  Parameters hash value read from the database
	 * @return array{hasWorkflowEntry: bool, workflowNull: bool, workflowHash: string, parametersHash: string, parametersPresent: bool}
	 */
	public static function describeWorkflowState( $workflowValue, $parametersValue ): array {
		$normalizedWorkflowHash = self::normalizeWorkflowHashFromDb( $workflowValue );
		$parametersHash         = self::normalizeParametersHash( $parametersValue );
		$parametersPresent      = $parametersHash !== '';
		$workflowNull           = $normalizedWorkflowHash === null;
		$workflowHash           = is_string( $normalizedWorkflowHash ) ? $normalizedWorkflowHash : '';
		$hasWorkflowEntry       = $workflowNull || $workflowHash !== '' || $parametersPresent;

		return [
			'hasWorkflowEntry' => $hasWorkflowEntry,
			'workflowNull'     => $workflowNull,
			'workflowHash'     => $workflowHash,
			'parametersHash'   => $parametersHash,
			'parametersPresent'=> $parametersPresent,
		];
	}
}
