"use client";

/**
 * Slider paired with a text input, from https://coss.com/origin/r/comp-254.json
 * (Origin UI). Vendored rather than installed with the shadcn CLI, which would
 * have dragged that registry's button and input in on top of ours.
 *
 * One change: validateAndUpdateValue returns the value it settled on. The
 * clamping rules live in here, and a caller mirroring the number into its own
 * state would otherwise have to either repeat them or read the result back in
 * an effect.
 *
 * The value lives in here, so a caller that also holds it has to remount the
 * field to push a new one in.
 */

import { useCallback, useState } from "react";

type UseSliderWithInputProps = {
  minValue?: number;
  maxValue?: number;
  initialValue?: number[];
  defaultValue?: number[];
};

export function useSliderWithInput({
  minValue = 0,
  maxValue = 100,
  initialValue = [minValue],
  defaultValue = [minValue],
}: UseSliderWithInputProps) {
  const [sliderValue, setSliderValue] = useState(initialValue);
  const [inputValues, setInputValues] = useState(
    initialValue.map((v) => v.toString()),
  );

  const showReset =
    sliderValue.length === defaultValue.length &&
    !sliderValue.every((value, index) => value === defaultValue[index]);

  const validateAndUpdateValue = useCallback(
    (rawValue: string, index: number) => {
      if (rawValue === "" || rawValue === "-") {
        const newInputValues = [...inputValues];
        newInputValues[index] = "0";
        setInputValues(newInputValues);

        const newSliderValues = [...sliderValue];
        newSliderValues[index] = 0;
        setSliderValue(newSliderValues);
        return 0;
      }

      const numValue = Number.parseFloat(rawValue);

      if (Number.isNaN(numValue)) {
        const newInputValues = [...inputValues];
        newInputValues[index] = sliderValue[index].toString();
        setInputValues(newInputValues);
        return sliderValue[index];
      }

      let clampedValue = Math.min(maxValue, Math.max(minValue, numValue));

      if (sliderValue.length > 1) {
        if (index === 0) {
          clampedValue = Math.min(clampedValue, sliderValue[1]);
        } else {
          clampedValue = Math.max(clampedValue, sliderValue[0]);
        }
      }

      const newSliderValues = [...sliderValue];
      newSliderValues[index] = clampedValue;
      setSliderValue(newSliderValues);

      const newInputValues = [...inputValues];
      newInputValues[index] = clampedValue.toString();
      setInputValues(newInputValues);

      return clampedValue;
    },
    [sliderValue, inputValues, minValue, maxValue],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
      const newValue = e.target.value;
      if (newValue === "" || /^-?\d*\.?\d*$/.test(newValue)) {
        const newInputValues = [...inputValues];
        newInputValues[index] = newValue;
        setInputValues(newInputValues);
      }
    },
    [inputValues],
  );

  const handleSliderChange = useCallback((newValue: number[]) => {
    setSliderValue(newValue);
    setInputValues(newValue.map((v) => v.toString()));
  }, []);

  const resetToDefault = useCallback(() => {
    setSliderValue(defaultValue);
    setInputValues(defaultValue.map((v) => v.toString()));
  }, [defaultValue]);

  return {
    handleInputChange,
    handleSliderChange,
    inputValues,
    resetToDefault,
    showReset,
    sliderValue,
    validateAndUpdateValue,
  };
}
