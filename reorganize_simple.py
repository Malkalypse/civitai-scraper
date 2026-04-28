#!/usr/bin/env python3
"""
Reorganize workflow.js by moving specific functions.
Uses simple line-based approach with careful boundary detection.
"""

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.readlines()

def write_file(path, lines):
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)

def find_function_start(lines, func_name):
    """Find the line number where func_name is declared."""
    for i, line in enumerate(lines):
        if f'function {func_name}(' in line or f'export async function {func_name}(' in line or f'async function {func_name}(' in line:
            return i
    return -1

def find_function_end(lines, start_idx):
    """Find the closing brace of the function starting at start_idx."""
    brace_count = 0
    found_opening = False
    
    for i in range(start_idx, len(lines)):
        line = lines[i]
        for char in line:
            if char == '{':
                brace_count += 1
                found_opening = True
            elif char == '}':
                brace_count -= 1
                if found_opening and brace_count == 0:
                    return i
    return -1

def extract_function(lines, func_name):
    """Extract function lines (including docstring before it)."""
    start = find_function_start(lines, func_name)
    if start < 0:
        return [], -1, -1
    
    # Go back to find the JSDoc comment
    doc_start = start
    while doc_start > 0 and (lines[doc_start - 1].strip().startswith('*') or lines[doc_start - 1].strip().startswith('/**') or lines[doc_start - 1].strip() == ''):
        doc_start -= 1
    
    end = find_function_end(lines, start)
    if end < 0:
        return [], -1, -1
    
    # Include trailing blank lines
    while end + 1 < len(lines) and not lines[end + 1].strip():
        end += 1
    
    return lines[doc_start:end + 1], doc_start, end

def reorganize(input_path, output_path):
    """Reorganize the workflow.js file."""
    lines = read_file(input_path)
    
    # Extract functions to move
    funcs_to_extract = [
        ('collectUniqueWorkflowButtons', 'after_scanMissingImageWorkflows'),
        ('fetchCachedWorkflowEntryState', 'after_scanMissingImageWorkflows'),
        ('buildModelFilenameForWorkflow', 'after_extractAndPersistWorkflowForElement'),
        ('applyPresentWorkflowUi', 'after_applyWorkflowUiToAllCardsForImageId'),
        ('applyParametersWorkflowUi', 'after_applyWorkflowUiToAllCardsForImageId'),
        ('applyMissingWorkflowUi', 'after_applyWorkflowUiToAllCardsForImageId'),
    ]
    
    extracted = {}
    for func_name, target in funcs_to_extract:
        func_lines, start, end = extract_function(lines, func_name)
        if func_lines:
            extracted[func_name] = (func_lines, start, end, target)
    
    # Remove extracted functions from lines (in reverse order to maintain line numbers)
    for func_name in sorted(extracted.keys(), key=lambda f: extracted[f][1], reverse=True):
        func_lines, start, end, target = extracted[func_name]
        del lines[start:end + 1]
    
    # Now insert them back
    # Group by target location
    insert_groups = {}
    for func_name, (func_lines, _, _, target) in extracted.items():
        if target not in insert_groups:
            insert_groups[target] = []
        insert_groups[target].append((func_name, func_lines))
    
    # Insert after_applyWorkflowUiToAllCardsForImageId (highest line number, insert last)
    if 'after_applyWorkflowUiToAllCardsForImageId' in insert_groups:
        target_func = 'applyWorkflowUiToAllCardsForImageId'
        end_idx = find_function_end(lines, find_function_start(lines, target_func))
        insert_idx = end_idx + 1
        # Skip blank lines
        while insert_idx < len(lines) and not lines[insert_idx].strip():
            insert_idx += 1
        
        # Insert in reverse order (right to left in file)
        for func_name, func_lines in reversed(insert_groups['after_applyWorkflowUiToAllCardsForImageId']):
            lines = lines[:insert_idx] + ['\n'] + func_lines + lines[insert_idx:]
    
    # Insert after_extractAndPersistWorkflowForElement
    if 'after_extractAndPersistWorkflowForElement' in insert_groups:
        target_func = 'extractAndPersistWorkflowForElement'
        end_idx = find_function_end(lines, find_function_start(lines, target_func))
        insert_idx = end_idx + 1
        while insert_idx < len(lines) and not lines[insert_idx].strip():
            insert_idx += 1
        
        for func_name, func_lines in reversed(insert_groups['after_extractAndPersistWorkflowForElement']):
            lines = lines[:insert_idx] + ['\n'] + func_lines + lines[insert_idx:]
    
    # Insert after_scanMissingImageWorkflows (insert last to avoid messing up indices)
    if 'after_scanMissingImageWorkflows' in insert_groups:
        target_func = 'scanMissingImageWorkflows'
        end_idx = find_function_end(lines, find_function_start(lines, target_func))
        insert_idx = end_idx + 1
        while insert_idx < len(lines) and not lines[insert_idx].strip():
            insert_idx += 1
        
        for func_name, func_lines in reversed(insert_groups['after_scanMissingImageWorkflows']):
            lines = lines[:insert_idx] + ['\n'] + func_lines + lines[insert_idx:]
    
    write_file(output_path, lines)
    print(f"Successfully reorganized {input_path}")
    print(f"Output written to {output_path}")

if __name__ == '__main__':
    reorganize('web/js/workflow.js', 'web/js/workflow.js')

