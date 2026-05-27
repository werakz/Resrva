import { useState } from "react";
import { SelectInput } from "../resrva/FormField";

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  options: Option[];
  placeholder?: string;
  onChange: (value: string) => void;
  className?: string;
  defaultValue?: string;
}

const Select: React.FC<SelectProps> = ({
  options,
  placeholder = "Select an option",
  onChange,
  className = "",
  defaultValue = "",
}) => {
  // Manage the selected value
  const [selectedValue, setSelectedValue] = useState<string>(defaultValue);

  const handleChange = (value: string) => {
    setSelectedValue(value);
    onChange(value); // Trigger parent handler
  };

  return (
    <SelectInput
      value={selectedValue}
      onChange={handleChange}
      buttonClassName={className}
      options={[
        { value: "", label: placeholder, disabled: true },
        ...options.map((option) => ({ value: option.value, label: option.label })),
      ]}
    />
  );
};

export default Select;
