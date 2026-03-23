import { useState } from 'react';

interface RegistrationProps {
    onSubmit: (data: { name: string; age: number; email?: string; notes?: string }) => void;
}

export default function Registration({
    onSubmit,
}: RegistrationProps) {
    const [name, setName] = useState('');
    const [age, setAge] = useState('');
    const [email, setEmail] = useState('');
    const [notes, setNotes] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = () => {
        const newErrors: Record<string, string> = {};
        if (!name.trim()) newErrors.name = 'Name is required';
        if (!age.trim()) {
            newErrors.age = 'Age is required';
        } else if (isNaN(Number(age)) || Number(age) < 1 || Number(age) > 120) {
            newErrors.age = 'Please enter a valid age (1–120)';
        }
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            newErrors.email = 'Please enter a valid email address';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        const trimmedEmail = email.trim();
        const trimmedNotes = notes.trim();

        onSubmit({
            name: name.trim(),
            age: Number(age),
            ...(trimmedEmail ? { email: trimmedEmail } : {}),
            ...(trimmedNotes ? { notes: trimmedNotes } : {}),
        });
    };

    const inputClasses = (field: string) =>
        `w-full px-4 py-3 rounded-xl border-2 transition-all duration-200 outline-none text-surface-800 bg-white/80 backdrop-blur-sm placeholder:text-surface-400 ${errors[field]
            ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100'
            : 'border-surface-200 focus:border-primary-400 focus:ring-4 focus:ring-primary-100'
        }`;

    return (
        <div className="min-h-full overflow-y-auto flex items-center justify-center p-3 md:p-6">
            <div className="w-full max-w-lg">
                <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-primary-200/30 border border-white/50 p-5 md:p-10">
                    {/* Header */}
                    <div className="text-center mb-6 md:mb-8">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-linear-to-br from-primary-400 to-primary-600 text-white mb-4 shadow-lg shadow-primary-300/40">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <h1 className="text-xl md:text-2xl font-bold text-surface-900">Participant Registration</h1>
                        <p className="text-surface-500 mt-1.5 text-sm">Please fill in your details to begin the experiment</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
                        {/* Name */}
                        <div>
                            <label htmlFor="name" className="block text-sm font-semibold text-surface-700 mb-1.5">
                                Full Name <span className="text-red-400">*</span>
                            </label>
                            <input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter your full name"
                                className={inputClasses('name')}
                            />
                            {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
                        </div>

                        {/* Age */}
                        <div>
                            <label htmlFor="age" className="block text-sm font-semibold text-surface-700 mb-1.5">
                                Age <span className="text-red-400">*</span>
                            </label>
                            <input
                                id="age"
                                type="number"
                                value={age}
                                onChange={(e) => setAge(e.target.value)}
                                placeholder="Enter your age"
                                min={1}
                                max={120}
                                className={inputClasses('age')}
                            />
                            {errors.age && <p className="mt-1 text-sm text-red-500">{errors.age}</p>}
                        </div>

                        {/* Email */}
                        <div>
                            <label htmlFor="email" className="block text-sm font-semibold text-surface-700 mb-1.5">
                                Email <span className="text-surface-400 font-normal">(optional)</span>
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your.email@example.com"
                                className={inputClasses('email')}
                            />
                            {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email}</p>}
                        </div>

                        {/* Notes */}
                        <div>
                            <label htmlFor="notes" className="block text-sm font-semibold text-surface-700 mb-1.5">
                                Notes <span className="text-surface-400 font-normal">(optional)</span>
                            </label>
                            <textarea
                                id="notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Any additional notes..."
                                rows={3}
                                className={inputClasses('notes') + ' resize-none'}
                            />
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            className="w-full py-3.5 rounded-xl bg-linear-to-r from-primary-500 to-primary-600 text-white font-semibold text-base shadow-lg shadow-primary-400/30 hover:shadow-xl hover:shadow-primary-400/40 hover:from-primary-600 hover:to-primary-700 active:scale-[0.98] transition-all duration-200 cursor-pointer"
                        >
                            Continue to Experiment
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
