from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hotels', '0004_ai_assistant'),
    ]

    operations = [
        migrations.AddField(
            model_name='aiassistant',
            name='ollama_url',
            field=models.CharField(blank=True, default='http://localhost:11434', max_length=500),
        ),
    ]
