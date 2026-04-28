#!/usr/bin/env python3
"""
Reorganize functions in workflow.js according to calling structure.

Functions to be reorganized:
1. Move collectUniqueWorkflowButtons() and fetchCachedWorkflowEntryState() 
   to appear right after scanMissingImageWorkflows()
   
2. Move buildModelFilenameForWorkflow() to appear right after 
   extractAndPersistWorkflowForElement()
   
3. Move applyPresentWorkflowUi(), applyParametersWorkflowUi(), applyMissingWorkflowUi()
   to appear right after applyWorkflowUiToAllCardsForImageId()
"""

import re

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def extract_function(content, func_name):
    """Extract a complete function from content."""
    # Match function declaration and extract until the closing brace
    pattern = rf'((?:^|\n)(?:function|async function|export async function)\s+{func_name}\s*\([^)]*\)\s*\{{(?:[^{{}}]|{{(?:[^{{}}]|{{[^{{}}]*}})*}})*\}})'
    match = re.search(pattern, content, re.DOTALL | re.MULTILINE)
    if match:
        return match.group(1).lstrip('\n'), match.start(), match.end()
    return None, -1, -1

def find_function_end(content, func_name):
    """Find the line number where a function ends."""
    match = re.search(rf'(function|async function|export async function)\s+{func_name}\s*\([^)]*\)', content)
    if not match:
        return -1
    
    # Count braces from function start
    pos = match.end()
    brace_count = 0
    found_opening = False
    
    while pos < len(content):
        if content[pos] == '{':
            brace_count += 1
            found_opening = True
        elif content[pos] == '}':
            brace_count -= 1
            if found_opening and brace_count == 0:
                return pos
        pos += 1
    
    return -1

def reorganize_workflow_js(input_path, output_path):
    """Reorganize the workflow.js file."""
    content = read_file(input_path)
    
    # Extract functions to be moved
    functions_to_move = {
        'collectUniqueWorkflowButtons': 'after_scanMissingImageWorkflows',
        'fetchCachedWorkflowEntryState': 'after_scanMissingImageWorkflows',
        'buildModelFilenameForWorkflow': 'after_extractAndPersistWorkflowForElement',
        'applyPresentWorkflowUi': 'after_applyWorkflowUiToAllCardsForImageId',
        'applyParametersWorkflowUi': 'after_applyWorkflowUiToAllCardsForImageId',
        'applyMissingWorkflowUi': 'after_applyWorkflowUiToAllCardsForImageId',
    }
    
    extracted = {}
    for func_name in functions_to_move.keys():
        func_code, start, end = extract_function(content, func_name)
        if func_code:
            extracted[func_name] = (func_code, start, end)
    
    # Remove extracted functions from content (in reverse order to preserve positions)
    for func_name in sorted(functions_to_move.keys(), key=lambda f: extracted.get(f, (None, float('inf'), None))[1], reverse=True):
        if func_name in extracted:
            func_code, start, end = extracted[func_name]
            # Remove blank lines after function
            end_pos = end
            while end_pos < len(content) and content[end_pos] in '\n':
                end_pos += 1
            content = content[:start] + content[end_pos:]
    
    # Find insertion points
    scan_end = find_function_end(content, 'scanMissingImageWorkflows')
    extract_end = find_function_end(content, 'extractAndPersistWorkflowForElement')
    apply_ui_end = find_function_end(content, 'applyWorkflowUiToAllCardsForImageId')
    
    # Insert functions back in correct locations
    if apply_ui_end > 0:
        # Skip to after the closing brace and newlines
        insert_pos = apply_ui_end + 1
        while insert_pos < len(content) and content[insert_pos] == '\n':
            insert_pos += 1
        
        # Insert the three apply functions in reverse order so positions stay correct
        for func_name in ['applyMissingWorkflowUi', 'applyParametersWorkflowUi', 'applyPresentWorkflowUi']:
            if func_name in extracted:
                content = content[:insert_pos] + '\n' + extracted[func_name][0] + '\n' + content[insert_pos:]
    
    if extract_end > 0:
        insert_pos = extract_end + 1
        while insert_pos < len(content) and content[insert_pos] == '\n':
            insert_pos += 1
        if 'buildModelFilenameForWorkflow' in extracted:
            content = content[:insert_pos] + '\n' + extracted['buildModelFilenameForWorkflow'][0] + '\n' + content[insert_pos:]
    
    if scan_end > 0:
        insert_pos = scan_end + 1
        while insert_pos < len(content) and content[insert_pos] == '\n':
            insert_pos += 1
        
        for func_name in ['fetchCachedWorkflowEntryState', 'collectUniqueWorkflowButtons']:
            if func_name in extracted:
                content = content[:insert_pos] + '\n' + extracted[func_name][0] + '\n' + content[insert_pos:]
    
    write_file(output_path, content)
    print(f"Reorganized file written to {output_path}")

if __name__ == '__main__':
    input_file = 'web/js/workflow.js'
    output_file = 'web/js/workflow.js'
    reorganize_workflow_js(input_file, output_file)
