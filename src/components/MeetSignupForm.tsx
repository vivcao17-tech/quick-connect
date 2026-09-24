import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type MeetQuestion = {
  position: number;
  id: string;
  questionKey: string;
  text: string;
  optionA: string;
  optionB: string;
  pack: string;
};

export type MeetSignupValues = {
  firstName: string;
  contact: string;
  berkeleyEmail: string;
  confirmed18: true;
  consented: true;
  availability: string;
  answers: { questionId: string; optionKey: "a" | "b" }[];
  signupAnswers: {
    priority: "fits" | "different";
    friendRead: "guess" | "impression" | "neither";
    meetingStyle: "online" | "one" | "group";
    weekly: "come" | "maybe" | "probably_not";
  };
  openAnswers: { interests: string; easier: string; missedConnection: string };
};

type FormState = Omit<MeetSignupValues, "confirmed18" | "consented" | "answers"> & {
  confirmed18: boolean;
  consented: boolean;
  answers: Record<string, "a" | "b">;
};

const initial = (availability: string): FormState => ({
  firstName: "",
  contact: "",
  berkeleyEmail: "",
  confirmed18: false,
  consented: false,
  availability,
  answers: {},
  signupAnswers: { priority: "" as never, friendRead: "" as never, meetingStyle: "" as never, weekly: "" as never },
  openAnswers: { interests: "", easier: "", missedConnection: "" },
});

function ChoiceSet({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-sm ${value === option.value ? "border-primary bg-secondary" : "border-border bg-card"}`}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            required
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export function MeetSignupForm({
  questions,
  slotLabel,
  submitLabel = "Join the meetup",
  onSubmit,
}: {
  questions: MeetQuestion[];
  slotLabel: string;
  submitLabel?: string;
  onSubmit: (values: MeetSignupValues) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(() => initial(slotLabel));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const ready = questions.every((question) => form.answers[question.id]);
  const stepOneReady = Boolean(form.firstName.trim() && form.contact.trim() && /.+@berkeley\.edu$/i.test(form.berkeleyEmail.trim()) && form.confirmed18 && form.consented);
  const stepTwoReady = questions.slice(0, 6).every((question) => form.answers[question.id]);
  const stepThreeReady = questions.slice(6, 10).every((question) => form.answers[question.id]) && Object.values(form.signupAnswers).every(Boolean);
  const stepFourReady = Boolean(form.openAnswers.interests.trim() && form.availability);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || !form.confirmed18 || !form.consented || !stepThreeReady || !stepFourReady) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        ...form,
        confirmed18: true,
        consented: true,
        answers: questions.map((question) => ({ questionId: question.id, optionKey: form.answers[question.id] ?? "a" })),
      });
      setForm(initial(slotLabel));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const updateSignup = <K extends keyof FormState["signupAnswers"]>(key: K, value: FormState["signupAnswers"][K]) =>
    setForm((current) => ({ ...current, signupAnswers: { ...current.signupAnswers, [key]: value } }));

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-10">
      <div aria-label={`Step ${step} of 4`}>
        <div className="flex justify-between text-sm text-muted-foreground"><span>Step {step} of 4</span><span>{step * 25}%</span></div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-[width]" style={{ width: `${step * 25}%` }} /></div>
      </div>

      {step === 1 && <section className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">First name<Input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="mt-1" /></label>
        <label className="text-sm">Phone or Instagram<Input required value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="mt-1" /></label>
        <label className="text-sm sm:col-span-2">Berkeley email<Input required type="email" pattern=".+@berkeley\.edu" placeholder="you@berkeley.edu" value={form.berkeleyEmail} onChange={(e) => setForm({ ...form, berkeleyEmail: e.target.value })} className="mt-1" /></label>
        <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" required checked={form.confirmed18} onChange={(e) => setForm({ ...form, confirmed18: e.target.checked })} /><span>I’m 18 or older.</span></label>
        <label className="flex items-start gap-3 text-sm sm:col-span-2"><input className="mt-1" type="checkbox" required checked={form.consented} onChange={(e) => setForm({ ...form, consented: e.target.checked })} /><span>I agree NoSure can share my first name and contact with the people in my group.</span></label>
      </section>}

      {step === 2 && <div className="space-y-8">
        {questions.slice(0, 6).map((question) => (
            <section key={question.id}>
              <p className="text-lg"><span className="mr-2 text-muted-foreground">{question.position}.</span>{question.text}</p>
              <ChoiceSet name={`question-${question.id}`} value={form.answers[question.id]} options={[{ value: "a", label: question.optionA }, { value: "b", label: question.optionB }]} onChange={(value) => setForm((current) => ({ ...current, answers: { ...current.answers, [question.id]: value as "a" | "b" } }))} />
            </section>
        ))}
      </div>}

      {step === 3 && <div className="space-y-8">
        {questions.slice(6, 10).map((question) => <section key={question.id}><p className="text-lg"><span className="mr-2 text-muted-foreground">{question.position}.</span>{question.text}</p><ChoiceSet name={`question-${question.id}`} value={form.answers[question.id]} options={[{ value: "a", label: question.optionA }, { value: "b", label: question.optionB }]} onChange={(value) => setForm((current) => ({ ...current, answers: { ...current.answers, [question.id]: value as "a" | "b" } }))} /></section>)}
        <section><p className="text-lg">11. You’d rather meet someone who:</p><ChoiceSet name="priority" value={form.signupAnswers.priority} options={[{ value: "fits", label: "Fits naturally into how I already live" }, { value: "different", label: "Pulls me into things I wouldn’t normally do" }]} onChange={(value) => updateSignup("priority", value as MeetSignupValues["signupAnswers"]["priority"])} /></section>
        <section><p className="text-lg">12. If a friend told you one thing about you:</p><ChoiceSet name="friendRead" value={form.signupAnswers.friendRead} options={[{ value: "guess", label: "Their guess about what you’d do" }, { value: "impression", label: "What they think you’re like" }, { value: "neither", label: "I’d rather not hear either" }]} onChange={(value) => updateSignup("friendRead", value as MeetSignupValues["signupAnswers"]["friendRead"])} /></section>
        <section><p className="text-lg">13. To meet new people, you’d:</p><ChoiceSet name="meetingStyle" value={form.signupAnswers.meetingStyle} options={[{ value: "online", label: "Keep it online" }, { value: "one", label: "Meet one-on-one" }, { value: "group", label: "Meet in a small group" }]} onChange={(value) => updateSignup("meetingStyle", value as MeetSignupValues["signupAnswers"]["meetingStyle"])} /></section>
        <section><p className="text-lg">14. If this happened every week:</p><ChoiceSet name="weekly" value={form.signupAnswers.weekly} options={[{ value: "come", label: "I’d come" }, { value: "maybe", label: "Maybe" }, { value: "probably_not", label: "Probably not" }]} onChange={(value) => updateSignup("weekly", value as MeetSignupValues["signupAnswers"]["weekly"])} /></section>
      </div>}

      {step === 4 && <><section className="space-y-6">
        <label className="block text-lg">15. What’s something you’re into, and what you like about it?<Textarea required maxLength={300} value={form.openAnswers.interests} onChange={(e) => setForm({ ...form, openAnswers: { ...form.openAnswers, interests: e.target.value } })} className="mt-3" /></label>
        <label className="block text-lg">16. What’s one thing you wish was easier about meeting people at Berkeley?<Textarea maxLength={500} value={form.openAnswers.easier} onChange={(e) => setForm({ ...form, openAnswers: { ...form.openAnswers, easier: e.target.value } })} className="mt-3" /></label>
        <label className="block text-lg">17. Someone you wanted to get to know better but never did — no names, just the situation.<Textarea maxLength={500} value={form.openAnswers.missedConnection} onChange={(e) => setForm({ ...form, openAnswers: { ...form.openAnswers, missedConnection: e.target.value } })} className="mt-3" /></label>
      </section>

      <section><p className="text-lg">Availability</p><ChoiceSet name="availability" value={form.availability} options={[{ value: slotLabel, label: slotLabel }]} onChange={(value) => setForm({ ...form, availability: value })} /></section>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </>}

      <div className="flex gap-3">
        {step > 1 && <Button type="button" variant="outline" onClick={() => setStep((current) => current - 1)}>Back</Button>}
        {step < 4 ? (
          <Button type="button" className="ml-auto" disabled={(step === 1 && !stepOneReady) || (step === 2 && !stepTwoReady) || (step === 3 && !stepThreeReady)} onClick={() => setStep((current) => current + 1)}>Next</Button>
        ) : (
          <Button type="submit" size="lg" className="ml-auto" disabled={busy || !ready || !stepFourReady}>{busy ? "Saving…" : submitLabel}</Button>
        )}
      </div>
    </form>
  );
}