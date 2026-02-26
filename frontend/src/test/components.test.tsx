import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextInput } from '../components/AuthForm/Input';
import { Checkbox } from '../components/AuthForm/Checkbox';

describe('Auth Form Components', () => {
  describe('TextInput Component', () => {
    it('renders with label and accepts input value', () => {
      const mockOnChange = vi.fn();
      
      render(
        <TextInput 
          id="test-input" 
          label="Test Label" 
          value="Initial Value" 
          onChange={mockOnChange} 
          placeholder="Enter text..."
        />
      );

      // Label should be visible and linked correctly
      const inputElement = screen.getByLabelText('Test Label');
      expect(inputElement).toBeInTheDocument();
      expect(inputElement).toHaveValue('Initial Value');
      expect(inputElement).toHaveAttribute('placeholder', 'Enter text...');

      // Trigger change event
      fireEvent.change(inputElement, { target: { value: 'New Value' } });
      
      // The onChange prop should be called with the new value
      expect(mockOnChange).toHaveBeenCalledWith('New Value');
    });

    it('displays error message and sets aria-invalid attribute when error is provided', () => {
      render(
        <TextInput 
          id="error-input" 
          label="Error Input" 
          value="" 
          onChange={() => {}} 
          error="This field is required" 
        />
      );

      // Verify aria-invalid is true
      const inputElement = screen.getByLabelText('Error Input');
      expect(inputElement).toHaveAttribute('aria-invalid', 'true');

      // Verify error message is rendered
      const errorMessage = screen.getByText('This field is required');
      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).toHaveClass('text-red-600');
    });
  });

  describe('Checkbox Component', () => {
    it('toggles value when clicked', () => {
      const mockOnChange = vi.fn();
      
      render(
        <Checkbox 
          id="remember-me" 
          label="Remember Me" 
          checked={false} 
          onChange={mockOnChange} 
        />
      );

      const checkbox = screen.getByLabelText('Remember Me');
      expect(checkbox).not.toBeChecked();

      fireEvent.click(checkbox);
      expect(mockOnChange).toHaveBeenCalledWith(true);
    });
  });
});
