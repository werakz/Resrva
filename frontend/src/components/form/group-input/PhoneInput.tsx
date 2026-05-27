import { useState } from "react";
import { SelectInput } from "../../resrva/FormField";

interface CountryCode {
  code: string;
  label: string;
}

interface PhoneInputProps {
  countries: CountryCode[];
  placeholder?: string;
  onChange?: (phoneNumber: string) => void;
  selectPosition?: "start" | "end"; // New prop for dropdown position
}

const PhoneInput: React.FC<PhoneInputProps> = ({
  countries,
  placeholder = "+1 (555) 000-0000",
  onChange,
  selectPosition = "start", // Default position is 'start'
}) => {
  const [selectedCountry, setSelectedCountry] = useState<string>("US");
  const [phoneNumber, setPhoneNumber] = useState<string>("+1");

  const countryCodes: Record<string, string> = countries.reduce(
    (acc, { code, label }) => ({ ...acc, [code]: label }),
    {}
  );

  const handleCountryChange = (newCountry: string) => {
    setSelectedCountry(newCountry);
    setPhoneNumber(countryCodes[newCountry]);
    if (onChange) {
      onChange(countryCodes[newCountry]);
    }
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPhoneNumber = e.target.value;
    setPhoneNumber(newPhoneNumber);
    if (onChange) {
      onChange(newPhoneNumber);
    }
  };

  return (
    <div className="relative flex">
      {/* Dropdown position: Start */}
      {selectPosition === "start" && (
        <div className="absolute z-20 w-[84px]">
          <SelectInput
            value={selectedCountry}
            onChange={(value) => handleCountryChange(value)}
            ariaLabel="Country code"
            buttonClassName="!rounded-l-lg !rounded-r-none !border-0 !border-r !border-gray-200 !bg-transparent !pl-3.5 !pr-2 !shadow-none dark:!border-gray-800"
            menuClassName="min-w-[104px]"
            options={countries.map((country) => ({ value: country.code, label: country.code }))}
          />
        </div>
      )}

      {/* Input field */}
      <input
        type="tel"
        value={phoneNumber}
        onChange={handlePhoneNumberChange}
        placeholder={placeholder}
        className={`dark:bg-dark-900 h-11 w-full ${
          selectPosition === "start" ? "pl-[84px]" : "pr-[84px]"
        } rounded-lg border border-gray-300 bg-transparent py-3 px-4 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800`}
      />

      {/* Dropdown position: End */}
      {selectPosition === "end" && (
        <div className="absolute right-0 z-20 w-[84px]">
          <SelectInput
            value={selectedCountry}
            onChange={(value) => handleCountryChange(value)}
            ariaLabel="Country code"
            buttonClassName="!rounded-l-none !rounded-r-lg !border-0 !border-l !border-gray-200 !bg-transparent !pl-3.5 !pr-2 !shadow-none dark:!border-gray-800"
            menuClassName="min-w-[104px]"
            options={countries.map((country) => ({ value: country.code, label: country.code }))}
          />
        </div>
      )}
    </div>
  );
};

export default PhoneInput;
